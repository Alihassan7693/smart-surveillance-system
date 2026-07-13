"""
stream_router.py
────────────────
WebSocket /ws/webcam  — frontend sends base64 JPEG frames, server replies with predictions
WebSocket /ws/rtsp    — single capture feeds both canvases; overlay drawn client-side
"""

import asyncio
import base64
import json
import logging
import os

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from database.detection_repository import save_detection
from models.model_manager import model_manager
from services.alert_service import send_alert_email
from services.inference_pipeline import run_inference
from services.storage_service import upload_clip_to_storage
from services.video_clip_service import save_anomaly_clip

router = APIRouter(tags=["stream"])
logger = logging.getLogger(__name__)


# Overlay drawing moved to client-side (frontend canvas). No server-side overlay needed.


# ──────────────────────────────────────────────────────────────────────────────
#  Webcam: frontend sends frames → backend predicts → backend sends result
# ──────────────────────────────────────────────────────────────────────────────
@router.websocket("/ws/webcam")
async def webcam_ws(websocket: WebSocket):
    """
    Message from frontend (TEXT JSON):
      {"type": "frame", "frame": "<base64 JPEG>"}

    Reply from backend (TEXT JSON):
      {"type": "result", "is_anomaly": bool, "stage1_conf": float,
       "anomaly_class": str|null, "stage2_conf": float|null}
    """
    from routers.settings_router import load_settings
    
    settings = load_settings()
    # Webcam captures at 10fps. FRAME_SKIP=1 → 100ms between selected frames,
    # matching training videos at ~30fps with FRAME_SKIP=3 (also ~100ms spacing).
    WEBCAM_FRAME_SKIP     = 1
    SEQUENCE_LENGTH       = 16                                              # fixed: 16 frames at 10fps = 1.6s
    STEP                  = SEQUENCE_LENGTH // 2                            # 8 frames = 0.8s update interval
    CONSECUTIVE_THRESHOLD = settings.get("webcam_consecutive_threshold", 2) # from settings
    MAX_ANOMALY_FRAMES    = SEQUENCE_LENGTH * 10                            # memory cap ~16s

    await websocket.accept()
    logger.info("Webcam WebSocket connected")

    frame_buffer        = []
    last_result         = None    # None until first inference completes
    loop                = asyncio.get_event_loop()
    inference_run       = False   # guard: don't send stale 0% before first run
    model_error_sent    = False   # send at most one model-not-loaded error per session

    # Event tracking
    consecutive_anomaly = 0       # consecutive anomaly windows in current event
    anomaly_active      = False   # True once event reaches CONSECUTIVE_THRESHOLD
    anomaly_frames      = []      # raw frames collected during the event
    event_class         = "Anomaly"
    event_max_conf      = 0.0

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") != "frame":
                continue

            # Decode base64 JPEG → OpenCV frame
            img_bytes = base64.b64decode(data["frame"])
            nparr     = np.frombuffer(img_bytes, np.uint8)
            frame     = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame is None:
                continue

            frame_buffer.append(frame)

            # Send buffering progress until first inference fires
            if not inference_run:
                await websocket.send_text(json.dumps({
                    "type":            "buffering",
                    "frames_buffered": len(frame_buffer),
                    "frames_needed":   SEQUENCE_LENGTH,
                }))

            # Trigger: buffer reaches SEQUENCE_LENGTH (16 frames = 1.6 s at 10fps).
            # After each inference: trimmed to STEP(8), so only 8 new frames needed (0.8 s).
            if len(frame_buffer) >= SEQUENCE_LENGTH:
                # Re-read threshold every window so Settings page changes take effect immediately
                CONSECUTIVE_THRESHOLD = load_settings().get("webcam_consecutive_threshold", 2)

                if model_manager.stage1_ready:
                    result = await loop.run_in_executor(
                        None, run_inference, frame_buffer.copy(), model_manager, WEBCAM_FRAME_SKIP
                    )
                    last_result   = result
                    inference_run = True

                    if result["is_anomaly"]:
                        consecutive_anomaly += 1

                        # Collect frames for clip (capped so memory stays safe)
                        if len(anomaly_frames) < MAX_ANOMALY_FRAMES:
                            anomaly_frames.extend(frame_buffer)

                        # Track the highest-confidence class seen during this event
                        if result["stage1_conf"] > event_max_conf:
                            event_max_conf = result["stage1_conf"]
                            event_class    = result["anomaly_class"] or "Anomaly"

                        # Event confirmed after CONSECUTIVE_THRESHOLD windows in a row
                        if consecutive_anomaly >= CONSECUTIVE_THRESHOLD:
                            anomaly_active = True

                    else:
                        # NORMAL window — if an event was active, it just ended
                        if anomaly_active:
                            _frames = anomaly_frames.copy()
                            _class  = event_class
                            _conf   = event_max_conf
                            logger.info(
                                f"Webcam event ended — saving clip "
                                f"[{_class} {_conf:.1%}, {len(_frames)} frames]"
                            )

                            def _save_and_alert(frames=_frames, cls=_class, conf=_conf):
                                clip_path = save_anomaly_clip(frames, cls)
                                clip_name = os.path.basename(clip_path) if clip_path else None
                                clip_url  = upload_clip_to_storage(clip_path) if clip_path else None
                                save_detection(cls, conf, clip_name, clip_url)
                                send_alert_email(cls, conf, clip_path)

                            loop.run_in_executor(None, _save_and_alert)

                        # Reset all event state
                        consecutive_anomaly = 0
                        anomaly_active      = False
                        anomaly_frames      = []
                        event_class         = "Anomaly"
                        event_max_conf      = 0.0

                    await websocket.send_text(json.dumps({
                        "type":          "result",
                        "is_anomaly":    result["is_anomaly"],
                        "stage1_conf":   round(result["stage1_conf"], 4),
                        "anomaly_class": result["anomaly_class"],
                        "stage2_conf":   round(result.get("stage2_conf") or 0.0, 4),
                    }))
                    logger.debug(
                        f"Webcam inference: {'ANOMALY' if result['is_anomaly'] else 'NORMAL'} "
                        f"conf={result['stage1_conf']:.2%}"
                    )

                elif not model_error_sent:
                    await websocket.send_text(json.dumps({
                        "type":    "error",
                        "message": "AI model not loaded — restart the backend server.",
                    }))
                    model_error_sent = True
                    logger.warning("Webcam: inference triggered but Stage-1 model not loaded")

                # Collect frames that arrived in the WebSocket buffer DURING inference.
                # These are more current than the oldest buffer frames, so decode them
                # and use them to seed the next window instead of discarding them.
                queued = []
                while True:
                    try:
                        msg      = await asyncio.wait_for(websocket.receive_text(), timeout=0.04)
                        msg_data = json.loads(msg)
                        if msg_data.get("type") == "frame":
                            img_b = base64.b64decode(msg_data["frame"])
                            npa   = np.frombuffer(img_b, np.uint8)
                            f     = cv2.imdecode(npa, cv2.IMREAD_COLOR)
                            if f is not None:
                                queued.append(f)
                    except asyncio.TimeoutError:
                        break
                if queued:
                    logger.debug(f"Collected {len(queued)} frames queued during inference for next window")

                # Sliding window seed: oldest STEP frames from current buffer + any queued
                # frames that arrived during inference (most recent), capped at STEP total.
                needed = STEP - len(queued)
                if needed > 0:
                    frame_buffer = frame_buffer[-needed:] + queued
                else:
                    frame_buffer = queued[-STEP:]

            elif inference_run and last_result is not None:
                # Buffer refilling between inferences — keep showing last result
                await websocket.send_text(json.dumps({
                    "type":          "result",
                    "is_anomaly":    last_result["is_anomaly"],
                    "stage1_conf":   round(last_result["stage1_conf"], 4),
                    "anomaly_class": last_result["anomaly_class"],
                    "stage2_conf":   round(last_result.get("stage2_conf") or 0.0, 4),
                }))

    except WebSocketDisconnect:
        logger.info("Webcam WebSocket disconnected")
    except Exception as exc:
        logger.error(f"Webcam stream error: {exc}", exc_info=True)


# ──────────────────────────────────────────────────────────────────────────────
#  RTSP — single capture feeds both canvases; overlay drawn client-side
# ──────────────────────────────────────────────────────────────────────────────
@router.websocket("/ws/rtsp")
async def rtsp_ws(websocket: WebSocket):
    """
    Frontend sends:  {"type": "start", "url": "rtsp://..."}

    Server pushes per frame (TEXT JSON):
      During warmup:
        {"type": "frame", "frame": "<base64 JPEG>",
         "buffering": true, "frames_buffered": N, "frames_needed": M}
      After first inference:
        {"type": "frame", "frame": "<base64 JPEG>",
         "is_anomaly": bool, "stage1_conf": float,
         "anomaly_class": str|null, "stage2_conf": float|null}

    One WebSocket, one cv2.VideoCapture — frontend draws the same JPEG to
    both the raw canvas (no overlay) and the ML canvas (with client-side overlay).
    """
    from routers.settings_router import load_settings

    settings              = load_settings()
    SEQUENCE_LENGTH       = settings.get("rtsp_sequence_length", settings.get("sequence_length", 48))
    STEP                  = SEQUENCE_LENGTH // 2
    CONSECUTIVE_THRESHOLD = settings.get("rtsp_consecutive_threshold", 2)
    MAX_ANOMALY_FRAMES    = SEQUENCE_LENGTH * 10

    await websocket.accept()
    logger.info("RTSP WebSocket connected")

    cap  = None
    loop = asyncio.get_event_loop()

    frame_buffer     = []
    last_result      = None
    inference_run    = False
    model_error_sent = False

    consecutive_anomaly = 0
    anomaly_active      = False
    anomaly_frames      = []
    event_class         = "Anomaly"
    event_max_conf      = 0.0

    try:
        raw  = await websocket.receive_text()
        data = json.loads(raw)
        url  = data.get("url", "")

        if not url:
            await websocket.send_text(json.dumps({"type": "error", "message": "No URL provided"}))
            return

        # Acknowledge immediately — VideoCapture can take up to 30 s on an unreachable host
        await websocket.send_text(json.dumps({"type": "connecting"}))

        # Run in executor: VideoCapture is a blocking TCP handshake that freezes the
        # asyncio event loop. Explicitly pass CAP_FFMPEG because the Windows defaults
        # (MSMF / DirectShow) cannot decode RTSP network streams and silently fail.
        try:
            cap = await asyncio.wait_for(
                loop.run_in_executor(None, lambda: cv2.VideoCapture(url, cv2.CAP_FFMPEG)),
                timeout=15.0
            )
        except asyncio.TimeoutError:
            await websocket.send_text(json.dumps({
                "type":    "error",
                "message": "Connection timed out (15 s). Check the camera IP and that port 554 is reachable.",
            }))
            return

        if not cap.isOpened():
            await websocket.send_text(json.dumps({
                "type":    "error",
                "message": (
                    f"Cannot open stream: {url}\n"
                    "Tips: verify the IP address, port 554 is open, "
                    "credentials are correct, and the camera is powered on."
                ),
            }))
            return

        logger.info(f"RTSP streaming from: {url}")

        # Limit OpenCV's internal decode buffer to ~3 frames.
        # The default (10-30 frames) means cap.read() returns old buffered frames
        # one-by-one, making live video look like slow motion.
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 3)

        while True:
            # Non-blocking stop check
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=0.01)
                if json.loads(msg).get("type") == "stop":
                    break
            except asyncio.TimeoutError:
                pass

            # Run cap.read() in executor so it never blocks the event loop
            ret, frame = await loop.run_in_executor(None, cap.read)
            if not ret:
                await asyncio.sleep(0.05)
                continue

            frame_buffer.append(frame.copy())

            # Inference trigger: full buffer (first: 0→48, after: 24→48 due to sliding trim)
            if len(frame_buffer) >= SEQUENCE_LENGTH:
                # Re-read threshold every window so Settings page changes take effect immediately
                CONSECUTIVE_THRESHOLD = load_settings().get("rtsp_consecutive_threshold", 2)

                if model_manager.stage1_ready:
                    from config import FRAME_SKIP as RTSP_FRAME_SKIP
                    result = await loop.run_in_executor(
                        None, run_inference, frame_buffer.copy(), model_manager, RTSP_FRAME_SKIP
                    )
                    last_result   = result
                    inference_run = True

                    if result["is_anomaly"]:
                        consecutive_anomaly += 1
                        if len(anomaly_frames) < MAX_ANOMALY_FRAMES:
                            anomaly_frames.extend(frame_buffer)
                        if result["stage1_conf"] > event_max_conf:
                            event_max_conf = result["stage1_conf"]
                            event_class    = result["anomaly_class"] or "Anomaly"
                        if consecutive_anomaly >= CONSECUTIVE_THRESHOLD:
                            anomaly_active = True
                    else:
                        if anomaly_active:
                            _frames = anomaly_frames.copy()
                            _class  = event_class
                            _conf   = event_max_conf
                            logger.info(f"RTSP event ended — saving clip [{_class} {_conf:.1%}, {len(_frames)} frames]")

                            def _save_and_alert(frames=_frames, cls=_class, conf=_conf):
                                clip_path = save_anomaly_clip(frames, cls)
                                clip_name = os.path.basename(clip_path) if clip_path else None
                                clip_url  = upload_clip_to_storage(clip_path) if clip_path else None
                                save_detection(cls, conf, clip_name, clip_url)
                                send_alert_email(cls, conf, clip_path)

                            loop.run_in_executor(None, _save_and_alert)

                        consecutive_anomaly = 0
                        anomaly_active      = False
                        anomaly_frames      = []
                        event_class         = "Anomaly"
                        event_max_conf      = 0.0

                elif not model_error_sent:
                    await websocket.send_text(json.dumps({
                        "type":    "error",
                        "message": "AI model not loaded — restart the backend server.",
                    }))
                    model_error_sent = True
                    logger.warning("RTSP: inference triggered but Stage-1 model not loaded")

                # Sliding window: keep newest STEP frames for next window
                frame_buffer = frame_buffer[-STEP:]

                # Drain every frame that queued in the RTSP buffer while inference ran.
                # With CAP_PROP_BUFFERSIZE=3 this is at most a few frames; without that
                # setting the buffer could be 20+ frames, all stale.
                drained = 0
                while True:
                    grabbed = await loop.run_in_executor(None, cap.grab)
                    if not grabbed:
                        break
                    drained += 1
                    if drained >= 60:   # hard cap: never loop more than ~2 s worth of frames
                        break
                if drained:
                    logger.debug(f"Drained {drained} stale RTSP frames after inference")

            # Encode raw frame — no overlay (client draws it)
            _, jpeg   = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
            frame_b64 = base64.b64encode(jpeg.tobytes()).decode()

            if not inference_run:
                msg = {
                    "type":            "frame",
                    "frame":           frame_b64,
                    "buffering":       True,
                    "frames_buffered": len(frame_buffer),
                    "frames_needed":   SEQUENCE_LENGTH,
                }
            else:
                msg = {
                    "type":          "frame",
                    "frame":         frame_b64,
                    "is_anomaly":    last_result["is_anomaly"],
                    "stage1_conf":   round(last_result["stage1_conf"], 4),
                    "anomaly_class": last_result["anomaly_class"],
                    "stage2_conf":   round(last_result.get("stage2_conf") or 0.0, 4),
                }

            await websocket.send_text(json.dumps(msg))
            # No artificial sleep — cap.read() blocks naturally until the camera's
            # next frame arrives, so the loop already runs at the camera's native fps.

    except WebSocketDisconnect:
        logger.info("RTSP WebSocket disconnected")
    except Exception as exc:
        logger.error(f"RTSP stream error: {exc}", exc_info=True)
    finally:
        if cap:
            cap.release()
