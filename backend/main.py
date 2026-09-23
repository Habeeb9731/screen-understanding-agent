from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from backend.services.pipeline import ScreenPipeline
from backend.services.grounding import answer_query
from backend.schemas import QueryRequest

BASE = Path(__file__).resolve().parent.parent
UPLOADS = BASE / "data" / "uploads"
UPLOADS.mkdir(parents=True, exist_ok=True)
FRONTEND = BASE / "frontend"
DB: dict[str, dict] = {}
pipeline = ScreenPipeline()

app = FastAPI(title="Screen Understanding Agent", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/", response_class=HTMLResponse)
def root():
    return (FRONTEND / "index.html").read_text()

@app.get("/api/health")
def health():
    return {"status": "ok", "providers": {"detector": pipeline.detector.name, "ocr": "tesseract" if pipeline.ocr.available else "unavailable"}}

@app.post("/api/screens")
async def create_screen(file: UploadFile = File(...)):
    if file.content_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise HTTPException(415, "Upload a PNG, JPG, or WEBP screenshot")
    screen_id = uuid4().hex[:12]
    suffix = Path(file.filename or "screen.png").suffix.lower() or ".png"
    path = UPLOADS / f"{screen_id}{suffix}"
    path.write_bytes(await file.read())
    DB[screen_id] = {"id": screen_id, "filename": file.filename or path.name, "path": str(path), "analysis": None}
    return {"screen_id": screen_id, "filename": DB[screen_id]["filename"]}

@app.post("/api/screens/{screen_id}/analyze")
def analyze_screen(screen_id: str):
    screen = DB.get(screen_id)
    if not screen:
        raise HTTPException(404, "Screen not found")
    if screen["analysis"] is None:
        screen["analysis"] = pipeline.analyze(screen_id, screen["filename"], Path(screen["path"]))
    return screen["analysis"]

@app.get("/api/screens/{screen_id}")
def get_screen(screen_id: str):
    screen = DB.get(screen_id)
    if not screen:
        raise HTTPException(404, "Screen not found")
    return screen["analysis"] or {"screen_id": screen_id, "filename": screen["filename"], "status": "uploaded"}

@app.get("/api/screens/{screen_id}/image")
def get_image(screen_id: str):
    screen = DB.get(screen_id)
    if not screen:
        raise HTTPException(404, "Screen not found")
    return FileResponse(screen["path"])

@app.post("/api/screens/{screen_id}/query")
def query_screen(screen_id: str, request: QueryRequest):
    screen = DB.get(screen_id)
    if not screen:
        raise HTTPException(404, "Screen not found")
    if screen["analysis"] is None:
        screen["analysis"] = pipeline.analyze(screen_id, screen["filename"], Path(screen["path"]))
    return answer_query(screen["analysis"], request.question)

@app.delete("/api/screens/{screen_id}")
def delete_screen(screen_id: str):
    screen = DB.pop(screen_id, None)
    if not screen:
        raise HTTPException(404, "Screen not found")
    Path(screen["path"]).unlink(missing_ok=True)
    return {"deleted": True}

app.mount("/static", StaticFiles(directory=FRONTEND), name="static")
