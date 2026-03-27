from fastapi import FastAPI, UploadFile, File, BackgroundTasks, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import uuid
import time
import os
import shutil
import pandas as pd
import random
from typing import List, Dict, Any

app = FastAPI()

# Allow CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job status storage
jobs = {}

# Ensure tmp directory exists
os.makedirs("tmp", exist_ok=True)

def generate_csv_from_data(job_id: str):
    """Generates the result CSV based on current preview_data."""
    data = jobs[job_id]["preview_data"]
    rows = []
    for item in data:
        animal = item["Animal"]
        # Format countries and confidences for CSV
        countries_str = ", ".join([m["country"] for m in item["Mappings"]])
        confidences_str = ", ".join([str(m["confidence"]) for m in item["Mappings"]])
        rows.append({
            "Animal": animal,
            "Countries": countries_str,
            "Confidence Scores": confidences_str
        })
    
    df = pd.DataFrame(rows)
    result_path = f"tmp/result_{job_id}.csv"
    df.to_csv(result_path, index=False)
    jobs[job_id]["result_file"] = result_path

def process_animal_workflow(job_id: str, animal_file: str, country_file: str):
    """Processes animal and country lists with per-country confidence and descriptions."""
    jobs[job_id]["status"] = "processing"
    
    try:
        for i in range(1, 4):
            time.sleep(0.3)
            jobs[job_id]["progress"] = i * 33

        animals_df = pd.read_csv(animal_file)
        countries_df = pd.read_csv(country_file)
        
        # Create dictionaries for fast lookup
        animal_desc_map = dict(zip(animals_df.iloc[:, 0], animals_df.get('Description', pd.Series(['No description available']*len(animals_df)))))
        
        country_list = []
        for _, row in countries_df.iterrows():
            country_list.append({
                "country": str(row.iloc[0]),
                "description": str(row.get('Description', 'No description available.'))
            })
        
        # Store full country list for the "Add" functionality
        jobs[job_id]["available_countries"] = country_list
        country_names = [c["country"] for c in country_list]
        country_desc_lookup = {c["country"]: c["description"] for c in country_list}
        
        animals = [a for a in animals_df.iloc[:, 0].dropna().tolist() if a in animal_desc_map]
        
        results = []
        for animal in animals:
            num_countries = random.randint(1, min(3, len(country_names)))
            selected = random.sample(country_names, k=num_countries)
            
            mappings = []
            for c in selected:
                mappings.append({
                    "country": c,
                    "confidence": round(random.uniform(0.7, 0.99), 2),
                    "description": country_desc_lookup.get(c, "No description available.")
                })
            
            results.append({
                "id": str(uuid.uuid4())[:8],
                "Animal": animal,
                "AnimalDescription": animal_desc_map.get(animal, "No description available."),
                "Mappings": mappings
            })
        
        jobs[job_id]["preview_data"] = results
        generate_csv_from_data(job_id)
        
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        
    except Exception as e:
        print(f"Error: {e}")
        jobs[job_id]["status"] = "failed"

@app.post("/api/upload/{workflow_id}")
async def upload_files(
    workflow_id: str, 
    background_tasks: BackgroundTasks, 
    animals: UploadFile = File(None),
    countries: UploadFile = File(None)
):
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "workflow_id": workflow_id,
        "progress": 0,
        "status": "queued",
        "result_file": None,
        "preview_data": None,
        "available_countries": [],
        "filename": "animal_results.csv"
    }

    animal_path = f"tmp/{job_id}_animals.csv"
    country_path = f"tmp/{job_id}_countries.csv"
    
    with open(animal_path, "wb") as buffer:
        shutil.copyfileobj(animals.file, buffer)
    with open(country_path, "wb") as buffer:
        shutil.copyfileobj(countries.file, buffer)
        
    background_tasks.add_task(process_animal_workflow, job_id, animal_path, country_path)
    return {"job_id": job_id}

@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    return jobs.get(job_id, {"error": "Not found"})

@app.get("/api/results/{job_id}")
async def get_results(job_id: str):
    if job_id not in jobs or not jobs[job_id]["preview_data"]:
        return {"error": "Not ready"}
    return {
        "data": jobs[job_id]["preview_data"],
        "available_countries": jobs[job_id].get("available_countries", [])
    }

@app.put("/api/results/{job_id}")
async def update_results(job_id: str, data: List[Dict[str, Any]] = Body(...)):
    if job_id not in jobs:
        return {"error": "Job not found"}
    
    jobs[job_id]["preview_data"] = data
    generate_csv_from_data(job_id)
    return {"status": "updated"}

@app.get("/api/download/{job_id}")
async def download_result(job_id: str):
    if job_id not in jobs or not jobs[job_id]["result_file"]:
        return {"error": "Not ready"}
    return FileResponse(jobs[job_id]["result_file"], filename=jobs[job_id]["filename"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
