from fastapi import BackgroundTasks, Body, FastAPI, File, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import csv
import io
import json
import random
import sqlite3
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List

import pandas as pd

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "jobs_v2.db"
JOB_COLUMNS = {
    "status",
    "progress",
    "available_countries",
    "animal_filename",
    "country_filename",
    "preview_data",
}
DEFAULT_COMPLIANCE = "0% Not Compliant"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        """CREATE TABLE IF NOT EXISTS jobs
           (job_id TEXT PRIMARY KEY,
            status TEXT,
            progress INTEGER,
            preview_data TEXT,
            available_countries TEXT,
            animal_filename TEXT,
            country_filename TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"""
    )
    c.execute(
        """CREATE TABLE IF NOT EXISTS job_rows
           (job_id TEXT NOT NULL,
            row_id TEXT NOT NULL,
            row_order INTEGER NOT NULL,
            animal TEXT,
            animal_description TEXT,
            type_of_organism TEXT,
            interesting_fact TEXT,
            recommended_countries_json TEXT,
            finalized_countries_json TEXT,
            compliant TEXT,
            identified_gaps TEXT,
            PRIMARY KEY (job_id, row_id),
            FOREIGN KEY (job_id) REFERENCES jobs(job_id) ON DELETE CASCADE)"""
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_job_rows_job_order ON job_rows(job_id, row_order)"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_job_rows_job_animal ON job_rows(job_id, animal)"
    )

    existing_columns = {
        row[1] for row in c.execute("PRAGMA table_info(jobs)").fetchall()
    }
    if "preview_data" not in existing_columns:
        c.execute("ALTER TABLE jobs ADD COLUMN preview_data TEXT")
    if "available_countries" not in existing_columns:
        c.execute("ALTER TABLE jobs ADD COLUMN available_countries TEXT")
    if "animal_filename" not in existing_columns:
        c.execute("ALTER TABLE jobs ADD COLUMN animal_filename TEXT")
    if "country_filename" not in existing_columns:
        c.execute("ALTER TABLE jobs ADD COLUMN country_filename TEXT")

    conn.commit()
    conn.close()


init_db()


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def update_job_db(job_id: str, updates: Dict[str, Any]):
    conn = get_db_connection()
    c = conn.cursor()
    for key, value in updates.items():
        if key not in JOB_COLUMNS:
            raise ValueError(f"Unsupported job column: {key}")
        if isinstance(value, (list, dict)):
            value = json.dumps(value)
        c.execute(f"UPDATE jobs SET {key} = ? WHERE job_id = ?", (value, job_id))
    conn.commit()
    conn.close()


def clean_text(value: Any, default: str = "") -> str:
    if pd.isna(value):
        return default
    text = str(value).strip()
    return text if text else default


def parse_json_list(value: Any) -> List[Dict[str, Any]]:
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value:
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def normalize_mapping(
    mapping: Dict[str, Any], country_desc_lookup: Dict[str, str]
) -> Dict[str, Any]:
    country = clean_text(mapping.get("country"), "")
    confidence = mapping.get("confidence", 0)
    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0

    return {
        "country": country,
        "confidence": confidence,
        "description": clean_text(
            mapping.get("description"),
            country_desc_lookup.get(country, "No description available."),
        ),
    }


def normalize_preview_rows(
    rows: List[Dict[str, Any]], available_countries: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    country_desc_lookup = {
        clean_text(country.get("country"), ""): clean_text(
            country.get("description"), "No description available."
        )
        for country in available_countries
    }

    normalized_rows = []
    for row in rows:
        recommended = row.get("RecommendedCountries", [])
        finalized = row.get("FinalizedCountries")
        if finalized is None:
            finalized = recommended

        normalized_rows.append(
            {
                "id": clean_text(row.get("id"), str(uuid.uuid4())[:8]),
                "Animal": clean_text(row.get("Animal"), ""),
                "AnimalDescription": clean_text(row.get("AnimalDescription"), ""),
                "TypeOfOrganism": clean_text(row.get("TypeOfOrganism"), ""),
                "InterestingFact": clean_text(row.get("InterestingFact"), ""),
                "RecommendedCountries": [
                    normalize_mapping(mapping, country_desc_lookup)
                    for mapping in recommended
                ],
                "FinalizedCountries": [
                    normalize_mapping(mapping, country_desc_lookup)
                    for mapping in finalized
                ],
                "Compliant": clean_text(row.get("Compliant"), DEFAULT_COMPLIANCE),
                "IdentifiedGaps": clean_text(row.get("IdentifiedGaps"), ""),
            }
        )

    return normalized_rows


def normalize_job_row(
    row: sqlite3.Row, available_countries: List[Dict[str, Any]]
) -> Dict[str, Any]:
    country_desc_lookup = {
        clean_text(country.get("country"), ""): clean_text(
            country.get("description"), "No description available."
        )
        for country in available_countries
    }
    recommended = [
        normalize_mapping(mapping, country_desc_lookup)
        for mapping in parse_json_list(row["recommended_countries_json"])
    ]
    finalized_raw = parse_json_list(row["finalized_countries_json"])
    finalized_source = finalized_raw if finalized_raw else recommended
    finalized = [
        normalize_mapping(mapping, country_desc_lookup)
        for mapping in finalized_source
    ]

    return {
        "id": clean_text(row["row_id"], str(uuid.uuid4())[:8]),
        "Animal": clean_text(row["animal"], ""),
        "AnimalDescription": clean_text(row["animal_description"], ""),
        "TypeOfOrganism": clean_text(row["type_of_organism"], ""),
        "InterestingFact": clean_text(row["interesting_fact"], ""),
        "RecommendedCountries": recommended,
        "FinalizedCountries": finalized,
        "Compliant": clean_text(row["compliant"], DEFAULT_COMPLIANCE),
        "IdentifiedGaps": clean_text(row["identified_gaps"], ""),
    }


def get_available_countries(conn: sqlite3.Connection, job_id: str) -> List[Dict[str, Any]]:
    job = conn.execute(
        "SELECT available_countries FROM jobs WHERE job_id = ?", (job_id,)
    ).fetchone()
    if not job or not job["available_countries"]:
        return []
    try:
        parsed = json.loads(job["available_countries"])
    except json.JSONDecodeError:
        return []
    return parsed if isinstance(parsed, list) else []


def insert_job_rows(
    conn: sqlite3.Connection, job_id: str, rows: List[Dict[str, Any]]
):
    conn.execute("DELETE FROM job_rows WHERE job_id = ?", (job_id,))
    payload = []
    for index, row in enumerate(rows):
        payload.append(
            (
                job_id,
                clean_text(row.get("id"), str(uuid.uuid4())[:8]),
                index,
                clean_text(row.get("Animal"), ""),
                clean_text(row.get("AnimalDescription"), ""),
                clean_text(row.get("TypeOfOrganism"), ""),
                clean_text(row.get("InterestingFact"), ""),
                json.dumps(row.get("RecommendedCountries", [])),
                json.dumps(row.get("FinalizedCountries", row.get("RecommendedCountries", []))),
                clean_text(row.get("Compliant"), DEFAULT_COMPLIANCE),
                clean_text(row.get("IdentifiedGaps"), ""),
            )
        )

    conn.executemany(
        """INSERT INTO job_rows
           (job_id, row_id, row_order, animal, animal_description, type_of_organism,
            interesting_fact, recommended_countries_json, finalized_countries_json,
            compliant, identified_gaps)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        payload,
    )


def migrate_job_rows_if_needed(conn: sqlite3.Connection, job_id: str):
    existing = conn.execute(
        "SELECT COUNT(*) AS count FROM job_rows WHERE job_id = ?", (job_id,)
    ).fetchone()
    if existing and existing["count"] > 0:
        return

    job = conn.execute(
        "SELECT preview_data, available_countries FROM jobs WHERE job_id = ?", (job_id,)
    ).fetchone()
    if not job or not job["preview_data"]:
        return

    try:
        preview_rows = json.loads(job["preview_data"])
    except json.JSONDecodeError:
        return

    available_countries = []
    if job["available_countries"]:
        try:
            available_countries = json.loads(job["available_countries"])
        except json.JSONDecodeError:
            available_countries = []

    normalized_rows = normalize_preview_rows(preview_rows, available_countries)
    insert_job_rows(conn, job_id, normalized_rows)
    conn.commit()


def process_animal_workflow(job_id: str, animals_bytes: bytes, countries_bytes: bytes):
    update_job_db(job_id, {"status": "processing"})

    try:
        for i in range(1, 4):
            time.sleep(0.3)
            update_job_db(job_id, {"progress": i * 33})

        animals_df = pd.read_csv(io.BytesIO(animals_bytes))
        countries_df = pd.read_csv(io.BytesIO(countries_bytes))

        country_list = []
        for _, row in countries_df.iterrows():
            country_list.append(
                {
                    "country": clean_text(row.iloc[0], ""),
                    "description": clean_text(
                        row.get("Description", "No description available.")
                    ),
                }
            )

        animal_details_map = {}
        for _, row in animals_df.iterrows():
            animal_name = clean_text(row.iloc[0], "")
            if not animal_name:
                continue

            animal_details_map[animal_name] = {
                "description": clean_text(
                    row.get("Description", "No description available."),
                    "No description available.",
                ),
                "type_of_organism": clean_text(row.get("Type of Organism", ""), ""),
                "interesting_fact": clean_text(row.get("Interesting Fact", ""), ""),
            }

        country_names = [country["country"] for country in country_list if country["country"]]
        country_desc_lookup = {
            country["country"]: country["description"]
            for country in country_list
            if country["country"]
        }

        if not country_names:
            raise ValueError("Country file must include at least one country.")

        animals = [
            animal
            for animal in animals_df.iloc[:, 0].dropna().tolist()
            if clean_text(animal, "") in animal_details_map
        ]

        results = []
        for animal_name in animals:
            animal = clean_text(animal_name, "")
            if not animal:
                continue

            animal_details = animal_details_map.get(animal, {})
            num_countries = random.randint(1, min(3, len(country_names)))
            selected = random.sample(country_names, k=num_countries)

            recommended_countries = []
            for country_name in selected:
                recommended_countries.append(
                    {
                        "country": country_name,
                        "confidence": round(random.uniform(0.7, 0.99), 2),
                        "description": country_desc_lookup.get(
                            country_name, "No description available."
                        ),
                    }
                )

            results.append(
                {
                    "id": str(uuid.uuid4())[:8],
                    "Animal": animal,
                    "AnimalDescription": animal_details.get(
                        "description", "No description available."
                    ),
                    "TypeOfOrganism": animal_details.get("type_of_organism", ""),
                    "InterestingFact": animal_details.get("interesting_fact", ""),
                    "RecommendedCountries": recommended_countries,
                    "FinalizedCountries": [
                        dict(mapping) for mapping in recommended_countries
                    ],
                    "Compliant": DEFAULT_COMPLIANCE,
                    "IdentifiedGaps": "",
                }
            )

        conn = get_db_connection()
        insert_job_rows(conn, job_id, results)
        conn.commit()
        conn.close()

        update_job_db(
            job_id,
            {
                "available_countries": country_list,
                "status": "completed",
                "progress": 100,
            },
        )

    except Exception as e:
        print(f"Workflow Error: {e}")
        update_job_db(job_id, {"status": "failed"})


def build_rows_where_clause(job_id: str, search: str):
    where_clause = "WHERE job_id = ?"
    params: List[Any] = [job_id]

    if search:
        pattern = f"%{search.lower()}%"
        where_clause += """
            AND (
                lower(animal) LIKE ?
                OR lower(animal_description) LIKE ?
                OR lower(type_of_organism) LIKE ?
                OR lower(interesting_fact) LIKE ?
                OR lower(compliant) LIKE ?
                OR lower(identified_gaps) LIKE ?
                OR lower(recommended_countries_json) LIKE ?
                OR lower(finalized_countries_json) LIKE ?
            )
        """
        params.extend([pattern] * 8)

    return where_clause, params


@app.post("/api/upload/{workflow_id}")
async def upload_files(
    workflow_id: str,
    background_tasks: BackgroundTasks,
    animals: UploadFile = File(...),
    countries: UploadFile = File(...),
):
    job_id = str(uuid.uuid4())
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_db_connection()
    conn.execute(
        """INSERT INTO jobs
           (job_id, status, progress, created_at, animal_filename, country_filename)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (job_id, "queued", 0, now, animals.filename, countries.filename),
    )
    conn.commit()
    conn.close()

    animals_bytes = await animals.read()
    countries_bytes = await countries.read()

    background_tasks.add_task(
        process_animal_workflow, job_id, animals_bytes, countries_bytes
    )
    return {
        "job_id": job_id,
        "status": "queued",
        "progress": 0,
        "created_at": now,
        "animal_filename": animals.filename,
        "country_filename": countries.filename,
    }


@app.get("/api/history")
async def get_history():
    conn = get_db_connection()
    jobs = conn.execute(
        """SELECT job_id, status, progress, created_at, animal_filename, country_filename
           FROM jobs
           ORDER BY created_at DESC"""
    ).fetchall()
    conn.close()
    return [dict(job) for job in jobs]


@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    conn = get_db_connection()
    job = conn.execute(
        "SELECT job_id, status, progress FROM jobs WHERE job_id = ?", (job_id,)
    ).fetchone()
    conn.close()
    if not job:
        return {"error": "Not found"}
    return dict(job)


@app.get("/api/jobs/{job_id}/rows")
async def get_job_rows(
    job_id: str,
    page: int = Query(0, ge=0),
    page_size: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    sort: str = Query("none"),
):
    conn = get_db_connection()
    job = conn.execute("SELECT job_id FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if not job:
        conn.close()
        return {"error": "Not found"}

    migrate_job_rows_if_needed(conn, job_id)
    available_countries = get_available_countries(conn, job_id)

    full_total_count = conn.execute(
        "SELECT COUNT(*) AS count FROM job_rows WHERE job_id = ?", (job_id,)
    ).fetchone()["count"]

    where_clause, params = build_rows_where_clause(job_id, search.strip())
    total_count = conn.execute(
        f"SELECT COUNT(*) AS count FROM job_rows {where_clause}", params
    ).fetchone()["count"]

    if sort == "asc":
        order_clause = "ORDER BY lower(animal) ASC, row_order ASC"
    elif sort == "desc":
        order_clause = "ORDER BY lower(animal) DESC, row_order ASC"
    else:
        order_clause = "ORDER BY row_order ASC"

    rows = conn.execute(
        f"""SELECT * FROM job_rows
            {where_clause}
            {order_clause}
            LIMIT ? OFFSET ?""",
        [*params, page_size, page * page_size],
    ).fetchall()
    conn.close()

    return {
        "data": [normalize_job_row(row, available_countries) for row in rows],
        "available_countries": available_countries,
        "total_count": total_count,
        "full_total_count": full_total_count,
        "page": page,
        "page_size": page_size,
    }


@app.put("/api/jobs/{job_id}/rows/{row_id}")
async def update_job_row(
    job_id: str,
    row_id: str,
    data: Dict[str, Any] = Body(...),
):
    conn = get_db_connection()
    job = conn.execute("SELECT job_id FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if not job:
        conn.close()
        return {"error": "Not found"}

    migrate_job_rows_if_needed(conn, job_id)
    available_countries = get_available_countries(conn, job_id)
    country_desc_lookup = {
        clean_text(country.get("country"), ""): clean_text(
            country.get("description"), "No description available."
        )
        for country in available_countries
    }

    row = conn.execute(
        "SELECT * FROM job_rows WHERE job_id = ? AND row_id = ?", (job_id, row_id)
    ).fetchone()
    if not row:
        conn.close()
        return {"error": "Row not found"}

    finalized = data.get("FinalizedCountries")
    if finalized is None:
        finalized = parse_json_list(row["finalized_countries_json"])
    normalized_finalized = [
        normalize_mapping(mapping, country_desc_lookup) for mapping in finalized
    ]
    compliant = clean_text(data.get("Compliant", row["compliant"]), DEFAULT_COMPLIANCE)
    identified_gaps = clean_text(data.get("IdentifiedGaps", row["identified_gaps"]), "")

    conn.execute(
        """UPDATE job_rows
           SET finalized_countries_json = ?, compliant = ?, identified_gaps = ?
           WHERE job_id = ? AND row_id = ?""",
        (
            json.dumps(normalized_finalized),
            compliant,
            identified_gaps,
            job_id,
            row_id,
        ),
    )
    conn.commit()
    updated_row = conn.execute(
        "SELECT * FROM job_rows WHERE job_id = ? AND row_id = ?", (job_id, row_id)
    ).fetchone()
    conn.close()

    return {
        "status": "updated",
        "data": normalize_job_row(updated_row, available_countries),
    }


@app.get("/api/jobs/{job_id}/export")
async def export_job_rows(job_id: str):
    conn = get_db_connection()
    job = conn.execute("SELECT job_id FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    if not job:
        conn.close()
        return {"error": "Not found"}

    migrate_job_rows_if_needed(conn, job_id)
    available_countries = get_available_countries(conn, job_id)
    rows = conn.execute(
        "SELECT * FROM job_rows WHERE job_id = ? ORDER BY row_order ASC", (job_id,)
    ).fetchall()
    conn.close()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Animal",
            "Animal Description",
            "Type of Organism",
            "Recommended Countries",
            "Finalized Countries",
            "Compliant",
            "Identified Gaps",
            "Interesting Fact",
        ]
    )

    for row in rows:
        normalized = normalize_job_row(row, available_countries)
        writer.writerow(
            [
                normalized["Animal"],
                normalized["AnimalDescription"],
                normalized["TypeOfOrganism"],
                "; ".join(
                    mapping["country"]
                    for mapping in normalized["RecommendedCountries"]
                ),
                "; ".join(
                    mapping["country"]
                    for mapping in normalized["FinalizedCountries"]
                ),
                normalized["Compliant"],
                normalized["IdentifiedGaps"],
                normalized["InterestingFact"],
            ]
        )

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="animal_results_{job_id}.csv"'
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
