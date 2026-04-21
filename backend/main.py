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

# Allow CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*"
    ],  # in production, we will want to limit this to specific origins
    allow_methods=["*"],
    allow_headers=["*"],
)

# New DB name to avoid legacy schema issues
DB_PATH = "jobs_v2.db"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # Simplified schema: No file paths or filenames needed!
    c.execute("""CREATE TABLE IF NOT EXISTS jobs
                 (job_id TEXT PRIMARY KEY, 
                  status TEXT, 
                  progress INTEGER, 
                  preview_data TEXT, 
                  available_countries TEXT, 
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP)""")
    conn.commit()
    conn.close()


init_db()


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def update_job_db(job_id: str, updates: Dict[str, Any]):
    conn = get_db_connection()
    c = conn.cursor()  # we may want to be consistent here and either use cursors or not
    for key, value in updates.items():
        if isinstance(value, (list, dict)):
            value = json.dumps(value)
        c.execute(f"UPDATE jobs SET {key} = ? WHERE job_id = ?", (value, job_id))
    conn.commit()
    conn.close()


def process_animal_workflow(job_id: str, animals_bytes: bytes, countries_bytes: bytes):
    """Processes datasets directly in memory using Pandas."""
    update_job_db(job_id, {"status": "processing"})

    try:
        # Artificial delay for UI feedback
        for i in range(1, 4):
            time.sleep(0.3)
            update_job_db(job_id, {"progress": i * 33})

        # Read directly from raw memory bytes - ZERO hard drive usage! dont need to write the file anywhere
        animals_df = pd.read_csv(io.BytesIO(animals_bytes))
        countries_df = pd.read_csv(io.BytesIO(countries_bytes))

        animal_desc_map = dict(
            zip(
                animals_df.iloc[:, 0],
                animals_df.get(
                    "Description",
                    pd.Series(["No description available"] * len(animals_df)),
                ),
            )
        )

        country_list = []
        for _, row in countries_df.iterrows():
            country_list.append(
                {
                    "country": str(row.iloc[0]),
                    "description": str(
                        row.get("Description", "No description available.")
                    ),
                }
            )

        country_names = [c["country"] for c in country_list]
        country_desc_lookup = {c["country"]: c["description"] for c in country_list}

        animals = [
            a for a in animals_df.iloc[:, 0].dropna().tolist() if a in animal_desc_map
        ]

        results = []
        for animal in animals:
            num_countries = random.randint(1, min(3, len(country_names)))
            selected = random.sample(country_names, k=num_countries)

            mappings = []
            for c in selected:
                mappings.append(
                    {
                        "country": c,
                        "confidence": round(random.uniform(0.7, 0.99), 2),
                        "description": country_desc_lookup.get(
                            c, "No description available."
                        ),
                    }
                )

            results.append(
                {
                    "id": str(uuid.uuid4())[:8],
                    "Animal": animal,
                    "AnimalDescription": animal_desc_map.get(
                        animal, "No description available."
                    ),
                    "Mappings": mappings,
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


@app.post(
    "/api/upload/{workflow_id}"
)  # function runs when someone sends a POST request to this url
async def upload_files(
    workflow_id: str,
    background_tasks: BackgroundTasks,
    animals: UploadFile = File(None),
    countries: UploadFile = File(None),
):
    job_id = str(uuid.uuid4())
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_db_connection()
    conn.execute(
        "INSERT INTO jobs (job_id, status, progress, created_at) VALUES (?, ?, ?, ?)",
        (job_id, "queued", 0, now),
    )
    conn.commit()
    conn.close()

    # Read files into memory bytes immediately
    animals_bytes = await animals.read()
    countries_bytes = await countries.read()

    background_tasks.add_task(
        process_animal_workflow, job_id, animals_bytes, countries_bytes
    )
    return {
        "job_id": job_id
    }  # so the front end can start asking questions about job status


@app.get("/api/history")
async def get_history():
    conn = get_db_connection()
    jobs = conn.execute(
        "SELECT job_id, status, created_at FROM jobs ORDER BY created_at DESC"
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

    return {
        "data": json.loads(job["preview_data"]),
        "available_countries": json.loads(job["available_countries"])
        if job["available_countries"]
        else [],
    }


# allows the user to make changes and save those changes back to database
@app.put("/api/results/{job_id}")
async def update_results(job_id: str, data: List[Dict[str, Any]] = Body(...)):
    # Instantaneous SQLite sync - no file system impact
    update_job_db(job_id, {"preview_data": data})
    return {"status": "updated"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app, host="0.0.0.0", port=8000
    )  # could potentially add more workers here for concurrency
