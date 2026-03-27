# Next.js + FastAPI LLM Workflow Webapp

A prototype for multi-workflow CSV processing with a sidebar interface.

## Project Structure
- `backend/`: FastAPI application.
  - `main.py`: API endpoints for CSV upload, status polling, and result download.
- `frontend/`: Next.js application (TypeScript, Vanilla CSS).
  - Sidebar with 3 workflow tabs.
  - CSV upload with progress bars and download links.

## How to Run

### 1. Backend Setup (FastAPI)
The backend uses `uv` for dependency management.

```bash
# From the root directory:
# 1. Create and sync the virtual environment
uv sync

# 2. Run the backend server
cd backend
../.venv/bin/python3 -m uvicorn main:app --port 8000 --reload
```
The backend will be available at [http://localhost:8000](http://localhost:8000).

### 2. Frontend Setup (Next.js)
```bash
# From the root directory in a NEW terminal:
cd frontend

# 1. Install dependencies
npm install

# 2. Run the development server
npm run dev
```
The application will be available at [http://localhost:3000](http://localhost:3000).

## Features
- **Sidebar Navigation**: Switch between 3 different LLM workflows.
- **CSV Upload**: Upload any CSV file for processing.
- **Progress Tracking**: Real-time progress bar (simulated).
- **Download**: Download the "processed" CSV once the job is complete.
