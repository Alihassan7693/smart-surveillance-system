"""
video_router.py
───────────────
WebSocket /api/video/ws/analyze

Protocol (client → server):
  1. TEXT  {"filename": "video.mp4", "size": 12345}
  2. BINARY  <chunk of file bytes>   (repeat until all bytes sent)
  3. TEXT  {"type": "upload_complete"}

Protocol (server → client):
  • TEXT {"type": "ready",    "total_frames": N, "fps": F}
  • TEXT {"type": "frame",    "frame_num": N, "total_frames": N,
                              "frame": "<base64 JPEG>",
                              "is_anomaly": bool,
                              "stage1_conf": float,
                              "anomaly_class": str|null,
                              "stage2_conf": float|null}
  • TEXT {"type": "complete", "total_frames": N,
                              "clips_analyzed": N,
                              "anomalies_found": bool,
                              "email_sent": bool}
  • TEXT {"type": "error",    "message": "..."}
"""

import asyncio
import base64
import json
import logging
import os
import uuid

import cv2
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from database.detection_repository import save_detection
from models.model_manager import model_manager
from services.alert_service import send_alert_email
from services.inference_pipeline import run_inference
from services.storage_service import upload_clip_to_storage
from services.video_clip_service import save_anomaly_clip

router = APIRouter(prefix="/api/video", tags=["video"])
logger = logging.getLogger(__name__)

# Ensure directories exist at startup
from config import CLIPS_DIR, TEMP_DIR
os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(CLIPS_DIR, exist_ok=True)


# ──────────────────────────────────────────────────────────────────────────────
#  Helper: draw simple overlay onto JPEG frame for display
# ──────────────────────────────────────────────────────────────────────────────
def _draw_overlay(frame, is_anomaly: bool, anomaly_class: str | None,
                  s1_conf: float, s2_conf: float | None):
    """Draw NORMAL/ANOMALY badge + type badge onto frame in-place."""
    import cv2 as _cv2

    h, w = frame.shape[:2]

    # ── TOP-LEFT: NORMAL / ANOMALY ─────────────────
    label        = "ANOMALY" if is_anomaly else "NORMAL"
    color        = (0, 0, 220) if is_anomaly else (0, 180, 0)   # BGR
    display_conf = s1_conf if is_anomaly else (1.0 - s1_conf)

    _cv2.rectangle(frame, (8, 8), (200, 48), color, -1)
    _cv2.putText(frame, label, (14, 36),
                 _cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)

    # Confidence bar (below badge) — shows confidence in the current label
    bar_w = int(190 * display_conf)
    _cv2.rectangle(frame, (8, 52), (198, 62), (50, 50, 50), -1)
    _cv2.rectangle(frame, (8, 52), (8 + bar_w, 62), color, -1)
    _cv2.putText(frame, f"{display_conf:.0%}", (204, 62),
                 _cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1)

    # ── TOP-RIGHT: anomaly type ─────────────────────
    if is_anomaly and anomaly_class:
        type_label = anomaly_class.upper()
        (tw, th), _ = _cv2.getTextSize(type_label, _cv2.FONT_HERSHEY_SIMPLEX, 0.75, 2)
        bx1 = w - tw - 24
        bx2 = w - 8
        _cv2.rectangle(frame, (bx1, 8), (bx2, 48), (0, 180, 220), -1)
        _cv2.putText(frame, type_label, (bx1 + 6, 36),
                     _cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 0, 0), 2)

        if s2_conf is not None:
            bar_w2 = int((bx2 - bx1) * s2_conf)
            _cv2.rectangle(frame, (bx1, 52), (bx2, 62), (50, 50, 50), -1)
            _cv2.rectangle(frame, (bx1, 52), (bx1 + bar_w2, 62), (0, 180, 220), -1)

    return frame


# ──────────────────────────────────────────────────────────────────────────────
#  Main WebSocket endpoint
# ──────────────────────────────────────────────────────────────────────────────
@router.websocket("/ws/analyze")
async def video_analyze_ws(websocket: WebSocket):
    from config import CLIPS_DIR, TEMP_DIR
    from routers.settings_router import load_settings
    
    settings = load_settings()
    SEQUENCE_LENGTH = settings.get("upload_sequence_length", settings.get("sequence_length", 48))
    VOTING_WINDOW   = settings.get("upload_voting_window",   settings.get("voting_window",  3))
    # FPS_SAMPLE intentionally not used here — the inference pipeline's
    # FRAME_SKIP=3 handles all frame sampling internally.
    
    await websocket.accept()
    logger.info("Video-analysis WebSocket connected")

    temp_path = None

    try:
        # ── 1. Receive file metadata ──────────────────────────────────────────
        meta_raw = await websocket.receive_text()
        meta     = json.loads(meta_raw)
        logger.info(f"Receiving: {meta.get('filename')} ({meta.get('size', '?')} bytes)")

        # ── 2. Receive binary file chunks ─────────────────────────────────────
        temp_path = os.path.join(TEMP_DIR, f"{uuid.uuid4().hex}.mp4")
        with open(temp_path, "wb") as f:
            while True:
                msg = await websocket.receive()
                if msg.get("bytes"):
                    f.write(msg["bytes"])
                elif msg.get("text"):
                    data = json.loads(msg["text"])
                    if data.get("type") == "upload_complete":
                        break

        logger.info(f"File saved to {temp_path}")

        # ── 3. Open video ─────────────────────────────────────────────────────
        cap = cv2.VideoCapture(temp_path)
        if not cap.isOpened():
            await websocket.send_text(json.dumps(
                {"type": "error", "message": "Cannot open video file"}))
            return

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
        video_fps    = cap.get(cv2.CAP_PROP_FPS) or 25.0

        await websocket.send_text(json.dumps({
            "type": "ready",
            "total_frames": total_frames,
            "fps": video_fps,
        }))

        # ── 4. Frame-by-frame processing ──────────────────────────────────────
        frame_buffer   = []          # accumulate SEQUENCE_LENGTH frames for inference
        anomaly_frames = []          # collect all anomalous frames for final clip
        frame_count    = 0           # raw frame counter
        sent_count     = 0           # frames actually sent to frontend
        clips_analyzed = 0
        anomaly_votes  = 0
        anomaly_clips  = 0
        email_sent     = False
        max_anomaly_conf = 0.0       # highest stage1 confidence seen in anomaly clips
        last_result    = {
            "is_anomaly": False, "stage1_conf": 0.0,
            "anomaly_class": None, "stage2_conf": None,
        }

        loop = asyncio.get_event_loop()

        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_count += 1

            # Accumulate for inference
            frame_buffer.append(frame.copy())

            # Run inference every SEQUENCE_LENGTH sampled frames
            if len(frame_buffer) >= SEQUENCE_LENGTH:
                if model_manager.stage1_ready:
                    result = await loop.run_in_executor(
                        None, run_inference, frame_buffer.copy(), model_manager
                    )
                    last_result = result
                    clips_analyzed += 1

                    if result["is_anomaly"]:
                        anomaly_votes += 1
                        anomaly_clips += 1
                        anomaly_frames.extend(frame_buffer)
                        max_anomaly_conf = max(max_anomaly_conf, result["stage1_conf"])
                        # Trigger alert after VOTING_WINDOW consecutive anomaly clips
                        if anomaly_votes >= VOTING_WINDOW and not email_sent:
                            clip_frames = anomaly_frames[-(SEQUENCE_LENGTH * VOTING_WINDOW):]
                            clip_path   = save_anomaly_clip(
                                clip_frames,
                                result["anomaly_class"] or "Anomaly",
                            )
                            clip_url = upload_clip_to_storage(clip_path) if clip_path else None
                            save_detection(
                                result["anomaly_class"] or "Anomaly",
                                result["stage1_conf"],
                                os.path.basename(clip_path) if clip_path else None,
                                clip_url,
                            )
                            # Send email in background (non-blocking)
                            loop.run_in_executor(
                                None, send_alert_email,
                                result["anomaly_class"] or "Anomaly",
                                result["stage1_conf"],
                                clip_path,
                            )
                            email_sent = True
                    else:
                        anomaly_votes = 0

                frame_buffer.clear()

            # Draw overlay on the frame before encoding
            display = frame.copy()
            display = _draw_overlay(
                display,
                last_result["is_anomaly"],
                last_result["anomaly_class"],
                last_result["stage1_conf"],
                last_result["stage2_conf"],
            )

            # Encode as JPEG and send to frontend
            _, jpeg = cv2.imencode(".jpg", display,
                                   [cv2.IMWRITE_JPEG_QUALITY, 70])
            frame_b64 = base64.b64encode(jpeg.tobytes()).decode()
            sent_count += 1

            await websocket.send_text(json.dumps({
                "type":          "frame",
                "frame_num":     frame_count,
                "total_frames":  total_frames,
                "frame":         frame_b64,
                "is_anomaly":    last_result["is_anomaly"],
                "stage1_conf":   round(last_result["stage1_conf"], 4),
                "anomaly_class": last_result["anomaly_class"],
                "stage2_conf":   round(last_result["stage2_conf"] or 0.0, 4),
            }))

            # Yield control so asyncio stays responsive
            await asyncio.sleep(0)

        cap.release()

        # ── 5. Save final clip and send email only if voting threshold reached ───
        if anomaly_frames and not email_sent and anomaly_votes >= VOTING_WINDOW:
            clip_path  = save_anomaly_clip(anomaly_frames, "Anomaly")
            final_conf = max_anomaly_conf or last_result.get("stage1_conf") or 0.0
            clip_url   = upload_clip_to_storage(clip_path) if clip_path else None
            save_detection(
                "Anomaly", final_conf,
                os.path.basename(clip_path) if clip_path else None,
                clip_url,
            )
            loop.run_in_executor(
                None, send_alert_email,
                "Anomaly", final_conf, clip_path,
            )
            email_sent = True

        # ── 6. Send completion message ────────────────────────────────────────
        await websocket.send_text(json.dumps({
            "type":            "complete",
            "total_frames":    frame_count,
            "clips_analyzed":  clips_analyzed,
            "anomalies_found": anomaly_clips > 0,
            "email_sent":      email_sent,
        }))
        logger.info(f"Analysis done — {frame_count} frames, {clips_analyzed} clips")

    except WebSocketDisconnect:
        logger.info("Video-analysis WebSocket disconnected by client")
    except Exception as exc:
        logger.error(f"Video-analysis error: {exc}", exc_info=True)
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": str(exc)}))
        except Exception:
            pass
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


# ──────────────────────────────────────────────────────────────────────────────
#  Serve saved clip files
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/clip/{filename}")
def get_clip(filename: str):
    from fastapi import HTTPException
    path = os.path.join(CLIPS_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Clip not found")
    return FileResponse(path, media_type="video/mp4")
