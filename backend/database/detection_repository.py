import logging
import uuid
from datetime import datetime

from database.firebase_client import get_db

logger = logging.getLogger(__name__)


def _new_id() -> str:
    return uuid.uuid4().hex[:8]


# ─────────────────────────────────────────────
#  WRITE
# ─────────────────────────────────────────────

def save_detection(
    anomaly_type: str,
    confidence: float,
    clip_filename: str | None = None,
    clip_url: str | None = None,
) -> str:
    """
    Save a detection record to Firebase.
    Returns the detection ID (even when Firebase is unavailable).

    clip_filename — basename of the local file (kept for reference)
    clip_url      — Firebase Storage public URL (used by the frontend Play button)
    """
    detection_id = _new_id()
    record = {
        "id":           detection_id,
        "timestamp":    datetime.now().isoformat(),
        "anomaly_type": anomaly_type,
        "confidence":   round(confidence, 4),
        "status":       "pending",
        "camera_id":    clip_filename or "",
        "clip_file":    clip_filename or "",
        "clip_url":     clip_url or "",
    }

    db = get_db()
    if db is None:
        logger.warning("Firebase unavailable — detection not saved to cloud")
        return detection_id

    try:
        db.reference(f"detections/{detection_id}").set(record)
        logger.info(f"Detection '{detection_id}' saved to Firebase")
    except Exception as exc:
        logger.error(f"Firebase write failed: {exc}")

    return detection_id


# ─────────────────────────────────────────────
#  READ
# ─────────────────────────────────────────────

def get_all_detections() -> list[dict]:
    db = get_db()
    if db is None:
        return []
    try:
        data = db.reference("detections").get()
        if not data:
            return []
        items = list(data.values())
        # Sort newest first
        items.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        return items
    except Exception as exc:
        logger.error(f"Firebase read failed: {exc}")
        return []


def normalize_anomaly_type(anomaly_type: str) -> str:
    if not anomaly_type:
        return "Unknown"

    normalized = str(anomaly_type).strip()
    key = normalized.lower()

    if key in {"fight", "fighting"}:
        return "Fight"
    if key in {"robbery", "robery"}:
        return "Robbery"
    if key in {"accident", "road accident", "road accidents", "road_accidents"}:
        return "Accident"

    return normalized.title()


def get_stats() -> dict:
    detections = get_all_detections()
    if not detections:
        return {"total": 0, "by_type": {}, "recent": []}

    by_type: dict[str, int] = {}
    for d in detections:
        t = normalize_anomaly_type(d.get("anomaly_type", "Unknown"))
        by_type[t] = by_type.get(t, 0) + 1

    return {
        "total":   len(detections),
        "by_type": by_type,
        "recent":  detections[:10],   # already sorted newest-first
    }
