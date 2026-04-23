from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Body
from fastapi.middleware.cors import CORSMiddleware
import uuid
import time
import pandas as pd
import random
import sqlite3
import json
import io
from datetime import datetime
from typing import List, Dict, Any

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*"
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "jobs_v2.db"
JOB_COLUMNS = {
    "status",
    "progress",
    "preview_data",
    "available_countries",
    "animal_filename",
    "country_filename",
}


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS jobs
                 (job_id TEXT PRIMARY KEY, 
                  status TEXT, 
                  progress INTEGER, 
                  preview_data TEXT, 
                  available_countries TEXT, 
                  animal_filename TEXT,
                  country_filename TEXT,
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP)""")
    existing_columns = {
        row[1] for row in c.execute("PRAGMA table_info(jobs)").fetchall()
    }
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
        recommended = row.get("RecommendedCountries")
        finalized = row.get("FinalizedCountries")
        legacy_mappings = row.get("Mappings", [])

        if recommended is None:
            recommended = legacy_mappings
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
                "Compliant": clean_text(
                    row.get("Compliant"), "0% Not Compliant"
                ),
                "IdentifiedGaps": clean_text(row.get("IdentifiedGaps"), ""),
            }
        )

    return normalized_rows


def process_animal_workflow(job_id: str, animals_bytes: bytes, countries_bytes: bytes):
    """Processes datasets directly in memory using Pandas."""
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

        country_names = [c["country"] for c in country_list if c["country"]]
        country_desc_lookup = {
            c["country"]: c["description"] for c in country_list if c["country"]
        }

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
                    "Compliant": "0% Not Compliant",
                    "IdentifiedGaps": "",
                }
            )

        update_job_db(
            job_id,
            {
                "preview_data": results,
                "available_countries": country_list,
                "status": "completed",
                "progress": 100,
            },
        )

    except Exception as e:
        print(f"Workflow Error: {e}")
        update_job_db(job_id, {"status": "failed"})


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


@app.get("/api/results/{job_id}")
async def get_results(job_id: str):
    conn = get_db_connection()
    job = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
    conn.close()

    if not job or not job["preview_data"]:
        return {"error": "Not ready"}

    available_countries = (
        json.loads(job["available_countries"]) if job["available_countries"] else []
    )
    preview_rows = json.loads(job["preview_data"])

    return {
        "data": normalize_preview_rows(preview_rows, available_countries),
        "available_countries": available_countries,
    }


@app.put("/api/results/{job_id}")
async def update_results(job_id: str, data: List[Dict[str, Any]] = Body(...)):
    conn = get_db_connection()
    job = conn.execute(
        "SELECT available_countries FROM jobs WHERE job_id = ?", (job_id,)
    ).fetchone()
    conn.close()

    available_countries = (
        json.loads(job["available_countries"])
        if job and job["available_countries"]
        else []
    )

    update_job_db(
        job_id,
        {"preview_data": normalize_preview_rows(data, available_countries)},
    )
    return {"status": "updated"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
