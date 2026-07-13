from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import os

from database.detection_repository import get_all_detections, get_stats
from config import CLIPS_DIR

router = APIRouter(prefix="/api/detections", tags=["detections"])


@router.get("")
def list_detections():
    """All detections, newest first."""
    return get_all_detections()


@router.get("/stats")
def detection_stats():
    """Aggregate stats: total, by_type, recent."""
    return get_stats()


@router.get("/clip/{filename}")
def serve_clip(filename: str):
    """Download a saved anomaly clip."""
    path = os.path.join(CLIPS_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Clip not found")
    return FileResponse(path, media_type="video/mp4")
