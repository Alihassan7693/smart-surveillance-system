import cv2
import logging
import os
import uuid
from datetime import datetime
from config import CLIPS_DIR

logger = logging.getLogger(__name__)

os.makedirs(CLIPS_DIR, exist_ok=True)


def save_anomaly_clip(frames: list, anomaly_type: str, fps: int = 8) -> str | None:
    """
    Write a list of BGR numpy frames to an MP4 file.
    Returns the full file path, or None if frames is empty.
    """
    if not frames:
        return None

    # Sanitise anomaly_type for filename
    safe_type = anomaly_type.replace(" ", "_").replace("/", "_")
    timestamp  = datetime.now().strftime("%Y%m%d_%H%M%S")
    uid        = uuid.uuid4().hex[:6]
    filename   = f"{safe_type}_{timestamp}_{uid}.mp4"
    filepath   = os.path.join(CLIPS_DIR, filename)

    h, w = frames[0].shape[:2]

    # Try H.264 (browser-compatible). Fall back to mp4v if unavailable.
    fourcc = cv2.VideoWriter_fourcc(*"avc1")
    writer = cv2.VideoWriter(filepath, fourcc, fps, (w, h))
    if writer.isOpened():
        logger.info("Using H.264 (avc1) codec for clip")
    else:
        logger.warning("avc1 unavailable — falling back to mp4v (may not play in browser)")
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(filepath, fourcc, fps, (w, h))

    for frame in frames:
        writer.write(frame)
    writer.release()

    return filepath
