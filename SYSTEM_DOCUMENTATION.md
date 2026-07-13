# Smart Surveillance System — Full Technical Documentation

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Project Structure](#2-project-structure)
3. [ML Model & Inference Pipeline](#3-ml-model--inference-pipeline)
4. [Video Upload Analysis](#4-video-upload-analysis)
5. [Live Feed — Webcam](#5-live-feed--webcam)
6. [Live Feed — RTSP / CCTV](#6-live-feed--rtsp--cctv)
7. [Anomaly Clip Storage](#7-anomaly-clip-storage)
8. [Alert System (Email)](#8-alert-system-email)
9. [History Page](#9-history-page)
10. [Admin & Authentication](#10-admin--authentication)
11. [Settings](#11-settings)
12. [Firebase Database Structure](#12-firebase-database-structure)
13. [Frontend Canvas & Overlay](#13-frontend-canvas--overlay)
14. [Configuration Reference](#14-configuration-reference)

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Smart Surveillance System                 │
│                                                             │
│  Frontend (React + Vite)          Backend (FastAPI)         │
│  ┌─────────────────┐              ┌──────────────────────┐  │
│  │  Live Feed Page │◄──WebSocket──│  stream_router.py    │  │
│  │  History Page   │◄────HTTP─────│  detection_router.py │  │
│  │  Upload Page    │◄──WebSocket──│  video_router.py     │  │
│  │  Settings Page  │◄────HTTP─────│  settings_router.py  │  │
│  │  Admin Page     │◄────HTTP─────│  admin_router.py     │  │
│  └─────────────────┘              └──────────────────────┘  │
│                                           │                  │
│                              ┌────────────┼────────────┐    │
│                              ▼            ▼            ▼    │
│                         ML Models    Firebase      Cloudinary│
│                         (PyTorch)   (Database)    (Videos)  │
└─────────────────────────────────────────────────────────────┘
```

**Tech Stack:**
- **Backend:** Python 3.11, FastAPI, Uvicorn, OpenCV, PyTorch
- **Frontend:** React 18, Vite, plain CSS
- **ML Models:** EfficientNet-B0 + Bidirectional GRU + Attention
- **Database:** Firebase Realtime Database (detections, users, alerts)
- **Video Storage:** Cloudinary (anomaly clips)
- **Email:** Gmail SMTP (anomaly alerts)

---

## 2. Project Structure

```
smart survelliance/
├── backend/
│   ├── main.py                        # FastAPI app entry point, router registration
│   ├── config.py                      # All constants and configuration
│   ├── settings.json                  # Runtime-editable settings (created on first save)
│   ├── firebase_credentials.json      # Firebase service account key
│   ├── saved_models/
│   │   ├── modelA_best.pth            # Stage 1: Normal vs Anomaly detector
│   │   └── model3c_best.pth           # Stage 2: Fight / Robbery / Accident classifier
│   ├── clips/                         # Temporary local clip storage (deleted after Cloudinary upload)
│   ├── temp/                          # Temporary uploaded video files (deleted after analysis)
│   ├── models/
│   │   ├── model_manager.py           # Loads and holds both PyTorch models
│   │   └── video_model.py             # EfficientNet-B0 + BiGRU + Attention architecture
│   ├── routers/
│   │   ├── stream_router.py           # WebSocket: /ws/webcam and /ws/rtsp
│   │   ├── video_router.py            # WebSocket: /api/video/ws/analyze + GET /api/video/clip/{file}
│   │   ├── detection_router.py        # GET /api/detections
│   │   ├── settings_router.py         # GET/PUT /api/settings/email and /api/settings/detection
│   │   ├── auth_router.py             # POST /api/auth/login
│   │   ├── admin_router.py            # Admin endpoints
│   │   ├── alerts_router.py           # GET /api/alerts/anomalies, incidents, dashboard-stats
│   │   ├── reports_router.py          # GET /api/reports/monthly, summary, export-pdf
│   │   └── system_settings_router.py  # System-level settings
│   ├── services/
│   │   ├── inference_pipeline.py      # Frame sampling, preprocessing, two-stage inference
│   │   ├── video_clip_service.py      # Write frames to MP4 using cv2.VideoWriter
│   │   ├── storage_service.py         # Upload clip to Cloudinary, delete local file
│   │   └── alert_service.py           # Gmail SMTP email with clip attachment
│   └── database/
│       ├── firebase_client.py         # Firebase Realtime Database connection
│       └── detection_repository.py    # save_detection(), get_all_detections(), get_stats()
└── frontend/src/
    ├── pages/
    │   ├── LiveFeedPage.jsx           # Webcam + RTSP dual-canvas live feed
    │   ├── HistoryPage.jsx            # Detection history table with Play button
    │   ├── UploadPage.jsx             # Video file upload and analysis
    │   ├── AdminPage.jsx              # Admin dashboard
    │   └── SettingsPage.jsx           # Email + detection settings
    ├── services/
    │   ├── detectionService.js        # Fetch detections from backend
    │   └── authService.js             # Login / JWT token management
    └── config.js                      # BACKEND_HTTP and BACKEND_WS URLs
```

---

## 3. ML Model & Inference Pipeline

### Architecture

Both Stage 1 and Stage 2 use the **same neural network architecture**:

```
Input Video Clip  →  EfficientNet-B0  →  BiGRU  →  Attention  →  Classifier
(1, 3, 16, 224, 224)   (per frame)      (temporal)   (pooling)    (linear)
```

- **EfficientNet-B0** — extracts spatial features from each frame independently
- **Bidirectional GRU** — processes the sequence of frame features in both forward and backward time direction, capturing temporal patterns
- **Attention** — weighs which frames are most important for the decision
- **Projection** — `Sequential(Linear, LayerNorm)` (not plain Linear — critical for correct weight loading)

| | Stage 1 | Stage 2 |
|---|---|---|
| **File** | `modelA_best.pth` | `model3c_best.pth` |
| **Task** | Binary: Normal vs Anomaly | 3-class: Fight / Robbery / Accident |
| **Output** | 2 logits → softmax | 3 logits → softmax |
| **Runs when** | Always | Only when Stage 1 detects Anomaly |

### Input Shape

```
Tensor shape: (1, 3, 16, 224, 224)
               │  │  │   │    └── width (pixels)
               │  │  │   └─────── height (pixels)
               │  │  └─────────── time (number of frames fed to model)
               │  └────────────── channels (RGB)
               └───────────────── batch size
```

### Frame Sampling — `_sample_frames(frames, frame_skip)`

The buffer holds more raw frames than the model needs. Sampling picks exactly **16 frames** spaced by `frame_skip`:

```
If buffer has enough frames (≥ 16 × frame_skip):
    indices = [0, skip, 2×skip, 3×skip, ..., 15×skip]

If buffer is shorter than ideal (startup / short clip):
    indices = np.linspace(0, len-1, 16)   ← uniform spread

If still fewer than 16: repeat last frame to pad
```

| Mode | frame_skip | Effective time spacing | Why |
|---|---|---|---|
| Video upload | 3 (default) | 3 frames ≈ 100ms at 30fps | Matches training data |
| Webcam | 1 | 1 frame ≈ 100ms at 10fps | Webcam runs at 10fps, so skip=1 gives same spacing |
| RTSP | 3 (default) | 3 frames ≈ 100ms at 30fps | Same as video upload |

**The 100ms spacing between selected frames matches training exactly** — this is why detection accuracy depends on keeping these values consistent.

### Preprocessing — `preprocess_clip(frames, frame_skip)`

Each of the 16 sampled frames goes through:

```
1. BGR → RGB          (OpenCV stores as BGR, PyTorch expects RGB)
2. Resize to 224×224  (cv2.resize)
3. ToTensor           (HWC uint8 → CHW float32, divides by 255)
4. ImageNet Normalize:
       mean = [0.485, 0.456, 0.406]
       std  = [0.229, 0.224, 0.225]
       pixel = (pixel - mean) / std

Result per frame: tensor (3, 224, 224)
Stack 16 frames:  tensor (16, 3, 224, 224)
Permute:          tensor (3, 16, 224, 224)   ← C, T, H, W
Unsqueeze batch:  tensor (1, 3, 16, 224, 224)
```

### Inference Flow — `run_inference(frames, model_manager, frame_skip)`

```
frames (raw BGR numpy list)
    │
    ▼
preprocess_clip()  →  clip tensor (1, 3, 16, 224, 224)
    │
    ▼
Stage 1 forward pass
    │
    ▼
softmax([normal_prob, anomaly_prob])
    │
    ├── anomaly_prob < ANOMALY_THRESHOLD (default 0.75)?
    │       → is_anomaly = False, stop here
    │
    └── anomaly_prob ≥ 0.75?
            → is_anomaly = True
            │
            ▼
        Stage 2 forward pass (only if anomaly detected)
            │
            ▼
        softmax([fight_prob, robbery_prob, accident_prob])
            │
            ▼
        anomaly_class = argmax → "Fight" / "Robbery" / "Accident"

Returns: {
    is_anomaly, stage1_conf, anomaly_class, stage2_conf,
    anomaly_classes_probs  (all 3 probabilities)
}
```

**ANOMALY_THRESHOLD** is loaded from `settings.json` on every inference call — changing it in Settings takes effect immediately without restart.

---

## 4. Video Upload Analysis

**Endpoint:** `WebSocket /api/video/ws/analyze`

### Step-by-Step Pipeline

```
Frontend                               Backend
   │                                      │
   │── TEXT {"filename": "x.mp4", ...} ──►│
   │── BINARY <file bytes chunk 1> ───────►│
   │── BINARY <file bytes chunk 2> ───────►│  (repeat until all bytes sent)
   │── TEXT {"type": "upload_complete"} ──►│
   │                                       │  saves to temp/uuid.mp4
   │                                       │  opens with cv2.VideoCapture
   │◄── TEXT {"type": "ready", "total_frames": N, "fps": F} ──
   │                                       │
   │                                       │  ┌── FRAME LOOP ──────────────┐
   │                                       │  │ read frame                 │
   │                                       │  │ append to frame_buffer     │
   │                                       │  │                            │
   │                                       │  │ if len(buffer) >= 48:      │
   │                                       │  │   run_inference(buffer)     │
   │                                       │  │   frame_buffer.clear()     │← full clear (not sliding)
   │                                       │  │   track anomaly votes      │
   │                                       │  │                            │
   │◄── TEXT {"type": "frame", "frame": b64, "is_anomaly": bool, ...} ─── │
   │                                       │  └────────────────────────────┘
   │◄── TEXT {"type": "complete", ...} ────│
```

### Key Parameters (Video Upload)

| Parameter | Default | Where set | Meaning |
|---|---|---|---|
| `SEQUENCE_LENGTH` | 48 | settings.json | Frames collected before each inference |
| `FRAME_SKIP` | 3 | config.py | Every 3rd frame is selected by _sample_frames |
| `VOTING_WINDOW` | 3 | settings.json | Consecutive anomaly windows before saving clip |

### Window Timing

With defaults (SEQUENCE_LENGTH=48, 30fps video):
- 48 frames ÷ 30fps = **1.6 seconds** of video per inference window
- 3 consecutive anomaly windows = **4.8 seconds** of continuous anomaly before alert

### Anomaly Voting & Alert

```
Window 1: Anomaly  → anomaly_votes = 1
Window 2: Normal   → anomaly_votes reset to 0
Window 3: Anomaly  → anomaly_votes = 1
Window 4: Anomaly  → anomaly_votes = 2
Window 5: Anomaly  → anomaly_votes = 3  ← VOTING_WINDOW reached
                   → save clip + save to Firebase + send email
                   → email_sent = True (won't trigger again for same video)
```

### What Happens to the Temp File

The uploaded video is saved to `backend/temp/uuid.mp4`. After analysis completes (or fails), the temp file is **deleted** in the `finally` block.

---

## 5. Live Feed — Webcam

**Endpoint:** `WebSocket /ws/webcam`

### Frontend Side (Browser)

```
getUserMedia({ video: true })          ← requests camera access
    │
    ▼
hidden <video> element receives stream
    │
    ├── Render loop at 60fps (requestAnimationFrame):
    │       draws video to processedCanvas (left) + rawCanvas (right)
    │       draws ML overlay on processedCanvas if result available
    │
    └── Capture interval every 100ms (10fps):
            draws video frame to off-screen 640×480 canvas
            encodes as JPEG quality 90%
            sends via WebSocket: {"type": "frame", "frame": "<base64>"}
```

### Backend Side — Sliding Window

```
WEBCAM_FRAME_SKIP     = 1       (10fps × skip1 = 100ms spacing = matches training)
SEQUENCE_LENGTH       = 16      (16 frames needed = 1.6 seconds of capture)
STEP                  = 8       (sliding window step = 0.8 seconds)
CONSECUTIVE_THRESHOLD = 2       (2 anomaly windows to confirm event)
MAX_ANOMALY_FRAMES    = 160     (memory cap = ~16 seconds of frames)
```

### Buffer Growth & Sliding Window

```
Start: buffer = []

Receive frames one by one, buffer grows:
[f1][f2][f3]...[f16]  ← 16 frames reached → RUN INFERENCE
                       │
                       ▼
                  Sliding trim: buffer = buffer[-8:]  ← keep last 8
                  buffer = [f9][f10]...[f16]

Wait for 8 more frames:
[f9]...[f16][f17]...[f24]  ← 16 frames again → RUN INFERENCE
                             (updates every 0.8 seconds instead of 1.6)
```

**First inference:** wait 1.6 seconds (16 frames from scratch)
**Subsequent inferences:** wait only 0.8 seconds (8 new frames needed)

### Consecutive Voting & Event Detection

```
consecutive_anomaly = 0
anomaly_active      = False
anomaly_frames      = []        ← accumulates raw frames during event

Window result = ANOMALY:
    consecutive_anomaly += 1
    anomaly_frames.extend(frame_buffer)   ← collect frames
    if consecutive_anomaly >= 2:
        anomaly_active = True             ← event confirmed

Window result = NORMAL:
    if anomaly_active == True:
        ── EVENT ENDED ──
        save clip from anomaly_frames
        upload to Cloudinary
        save to Firebase
        send email
    
    consecutive_anomaly = 0
    anomaly_active      = False
    anomaly_frames      = []              ← reset
```

**Important:** The clip is saved when the FIRST NORMAL window appears after a confirmed anomaly. This means the clip captures the **entire duration** of the event, not just when it was first detected.

### Warming Up Progress Bar

Before the first inference runs, backend sends:
```json
{"type": "buffering", "frames_buffered": 8, "frames_needed": 16}
```
Frontend shows a progress bar: `Warming up... (8/16 frames)`

After first inference, backend sends `{"type": "result", ...}` — progress bar disappears and the ML badge appears.

### Between Inferences

While the buffer is refilling (after sliding trim, waiting for 8 new frames), the backend re-sends the **last result** so the badge doesn't disappear. The frontend overlay stays live because of the `latestResultRef` pattern — the 60fps render loop always draws the most recent result.

---

## 6. Live Feed — RTSP / CCTV

**Endpoint:** `WebSocket /ws/rtsp`

### Connection Protocol

```
Frontend                     Backend
   │                            │
   │── TEXT {"type":"start",    │
   │         "url":"rtsp://..."}►│  opens cv2.VideoCapture(url)
   │                            │
   │◄── per-frame messages ─────│  continuous loop
   │                            │
   │── TEXT {"type":"stop"} ───►│  breaks loop, cap.release()
```

### Single Connection Architecture

One WebSocket serves **both** the raw canvas and the ML canvas. The backend sends one message per frame that contains the raw JPEG. The frontend draws the same JPEG to both canvases — adding an overlay only to the processed canvas.

```
Backend reads frame from RTSP camera
    │
    ├── Appends to frame_buffer
    ├── Encodes as JPEG (quality 70) → base64
    │
    ├── if buffer < SEQUENCE_LENGTH:   sends with "buffering": true
    └── if buffer ≥ SEQUENCE_LENGTH:   runs inference, sends with result
```

### Key Parameters (RTSP)

| Parameter | Default | Source |
|---|---|---|
| `SEQUENCE_LENGTH` | 48 | settings.json |
| `STEP` | 24 (= 48÷2) | derived |
| `CONSECUTIVE_THRESHOLD` | 2 | hardcoded |
| `MAX_ANOMALY_FRAMES` | 480 (= 48×10) | derived |
| JPEG quality | 70 | hardcoded |
| Frame rate cap | ~30fps | `asyncio.sleep(0.03)` |

### RTSP Message Format

**During warmup (buffer filling):**
```json
{
  "type": "frame",
  "frame": "<base64 JPEG>",
  "buffering": true,
  "frames_buffered": 24,
  "frames_needed": 48
}
```

**After first inference:**
```json
{
  "type": "frame",
  "frame": "<base64 JPEG>",
  "is_anomaly": true,
  "stage1_conf": 0.8923,
  "anomaly_class": "Fight",
  "stage2_conf": 0.7654
}
```

The same sliding window, consecutive voting, clip saving, and email logic as webcam applies to RTSP — with STEP=24 (50% overlap) instead of 8.

### Frontend RTSP Canvas Drawing

```javascript
ws.onmessage = (evt) => {
    const data = JSON.parse(evt.data)
    let frameResult = null     // captured in closure for this specific frame

    if (data.buffering) {
        setBufferingProgress(...)
    } else {
        frameResult = data     // snapshot result for THIS frame's img.onload
        setProcessedResult(data)
    }

    const img = new Image()
    img.onload = () => {
        // Raw canvas: clean frame, no overlay
        rawCanvas.getContext('2d').drawImage(img, 0, 0)

        // Processed canvas: same frame + overlay drawn on top
        processedCtx.drawImage(img, 0, 0)
        if (frameResult) drawOverlay(frameResult, processedCanvas)
    }
    img.src = `data:image/jpeg;base64,${data.frame}`
}
```

The `frameResult` closure capture is critical — without it, `img.onload` would use `latestResultRef.current` which may have been updated by a newer frame before the image finishes loading.

---

## 7. Anomaly Clip Storage

### Full Pipeline

```
1. Frames collected during anomaly event (raw BGR numpy arrays)
        │
        ▼
2. save_anomaly_clip(frames, anomaly_type, fps=8)
        │   Filename: Fight_20260625_143022_a3f9b1.mp4
        │   Codec: tries H.264 (avc1) first, falls back to mp4v
        │   Saves to: backend/clips/
        │
        ▼
3. upload_clip_to_storage(local_path)
        │   Uploads to Cloudinary under folder: anomaly_clips/
        │   Modifies URL: inserts /vc_h264/ for browser-compatible playback
        │   Returns: https://res.cloudinary.com/diubedshx/video/upload/vc_h264/...
        │
        ├── Upload success:
        │       delete local file (backend/clips/ stays empty)
        │       return URL
        │
        └── Upload failure:
                keep local file as fallback
                return None

4. save_detection(anomaly_type, confidence, clip_filename, clip_url)
        │   Saves record to Firebase Realtime Database
        │   clip_url = Cloudinary URL (or "" if upload failed)
```

### Why Local First, Not Directly to Cloud

`cv2.VideoWriter` can only write to a file path — it cannot stream directly to a network URL. Local disk is the mandatory intermediate step. The file is deleted immediately after a successful Cloudinary upload, so disk usage stays near zero.

### Cloudinary URL Transformation

Cloudinary's `vc_h264` transformation transcodes the video to H.264 on first access, then caches the result. Without this, browsers cannot play MPEG-4 Part 2 (mp4v) encoded files.

```
Original URL:
  https://res.cloudinary.com/diubedshx/video/upload/v123.../anomaly_clips/file.mp4

With H.264 transcode:
  https://res.cloudinary.com/diubedshx/video/upload/vc_h264/v123.../anomaly_clips/file.mp4
```

---

## 8. Alert System (Email)

**File:** `backend/services/alert_service.py`

### When Alert Is Sent

| Mode | Trigger |
|---|---|
| Webcam | First NORMAL window after `anomaly_active = True` (event ended) |
| RTSP | Same — first NORMAL window after confirmed event |
| Video Upload | After `VOTING_WINDOW` consecutive anomaly windows |

The alert is sent **in a background thread** using `loop.run_in_executor()` so it does not block the real-time frame processing loop.

### Email Content

```
Subject: 🚨 ANOMALY DETECTED: FIGHT

Body:
  Smart Surveillance System — ANOMALY ALERT
  ==========================================
  Detection Time : 2026-06-25 14:30:22
  Anomaly Type   : FIGHT
  Confidence     : 89.2%

  An anomalous activity has been detected in the surveillance feed.
  Please review the attached video clip immediately.

Attachment: Fight_20260625_143022_a3f9b1.mp4  (the local file before upload)
```

### SMTP Configuration

- Server: `smtp.gmail.com` port 465 (SSL)
- Requires a **Gmail App Password** (not your regular Gmail password)
- Sender and receiver emails are configurable in the Settings page
- `EMAIL_ENABLED = True` in config.py (set False to disable all emails)

---

## 9. History Page

**File:** `frontend/src/pages/HistoryPage.jsx`

### Data Flow

```
HistoryPage loads
    │
    ▼
GET /api/detections  →  detection_repository.get_all_detections()
    │                         reads Firebase: detections/* 
    │                         sorts newest-first
    │
    ▼
Renders table:
    ID | Timestamp | Anomaly Type | Confidence bar | Play button

Auto-refresh every 20 seconds (setInterval)
```

### Play Button Logic

```javascript
{d.clip_url
  ? <a href={d.clip_url}>▶ Play</a>          // Cloudinary URL (new records)
  : d.clip_file
    ? <a href={`${BACKEND_HTTP}/api/video/clip/${d.clip_file}`}>▶ Play</a>  // backend fallback (old records)
    : <span>—</span>
}
```

New anomaly records have `clip_url` (Cloudinary). Old records saved before Cloudinary integration only have `clip_file` and fall back to the local backend URL.

### Badge Colors

| Type | Color |
|---|---|
| Fight | `#ef4444` (red) |
| Robbery | `#f97316` (orange) |
| Accident | `#8b5cf6` (purple) |

---

## 10. Admin & Authentication

**Login endpoint:** `POST /api/auth/login`

```json
Request:  {"username": "admin", "password": "admin123"}
Response: {"access_token": "<JWT>", "token_type": "bearer"}
```

JWT payload contains `{"role": "admin", "exp": ...}`. Token expires after 24 hours (`JWT_EXPIRE_HOURS = 24` in config.py).

Protected endpoints (Settings) require `Authorization: Bearer <token>` header. The `verify_token` dependency in `settings_router.py` decodes and validates the JWT.

---

## 11. Settings

**File:** `backend/routers/settings_router.py`
**Storage:** `backend/settings.json` (created on first save, defaults from config.py if missing)

### Email Settings (`/api/settings/email`)

| Setting | Description |
|---|---|
| `sender_email` | Gmail account that sends alerts |
| `sender_password` | Gmail App Password (not regular password) |
| `receiver_email` | Email address that receives alerts |

### Detection Settings (`/api/settings/detection`)

| Setting | Default | Description |
|---|---|---|
| `anomaly_threshold` | 0.75 | Stage 1 confidence needed to flag anomaly (0.0–1.0) |
| `sequence_length` | 48 | Frames per inference window (RTSP + video upload) |
| `fps_sample` | 3 | Frame skip for video upload |
| `voting_window` | 3 | Consecutive anomaly windows before video-upload alert |

**Changes take effect immediately** — settings are read from `settings.json` on every inference call. No restart needed.

### Threshold Effect

- **Lower threshold (e.g. 0.5):** more sensitive, more false positives
- **Higher threshold (e.g. 0.9):** less sensitive, fewer false positives, may miss real events
- Default 0.75 balances sensitivity and specificity based on model training

---

## 12. Firebase Database Structure

```
Firebase Realtime Database
└── detections/
│   └── <8-char hex ID>/
│       ├── id           : "a3f9b1c2"
│       ├── timestamp    : "2026-06-25T14:30:22.123456"
│       ├── anomaly_type : "Fight"
│       ├── confidence   : 0.8923
│       ├── status       : "pending"
│       ├── camera_id    : "Fight_20260625_143022_a3f9b1.mp4"
│       ├── clip_file    : "Fight_20260625_143022_a3f9b1.mp4"
│       └── clip_url     : "https://res.cloudinary.com/diubedshx/video/upload/vc_h264/..."
│
├── alerts/
└── users/
```

`clip_file` holds the local filename (kept for reference). `clip_url` holds the Cloudinary URL used by the Play button.

---

## 13. Frontend Canvas & Overlay

### Dual Canvas Layout

Both webcam and RTSP show two canvases side by side:

```
┌──────────────────────┐  ┌──────────────────────┐
│   🎯 Processing      │  │   ▶ Raw Playback      │
│   (ML Detection)     │  │   (No Delay)          │
│                      │  │                        │
│  [video + overlay]   │  │  [clean video frame]  │
│                      │  │                        │
│  ✓ NORMAL  82.3%    │  │  ✓ Streaming (WEBCAM) │
└──────────────────────┘  └──────────────────────┘
```

### Overlay Drawing — `drawOverlay(result, canvas)`

All overlay rendering is done on the **client side** in JavaScript (no OpenCV on the backend for overlays):

```
Top-left badge:
  green rectangle + "NORMAL"  or  red rectangle + "ANOMALY"

Below badge:
  grey bar (170px wide) + colored fill proportional to stage1_conf

Top-right badge (only if anomaly):
  colored rectangle (Fight=red, Robbery=orange, Accident=purple)
  + anomaly class name
```

### Webcam Render Loop

```javascript
const renderFrame = () => {
    // Draw live video to both canvases from hidden <video> element
    processedCtx.drawImage(videoElement, 0, 0, w, h)
    if (latestResultRef.current) {
        drawOverlay(latestResultRef.current, processedCanvas)
    }
    rawCtx.drawImage(videoElement, 0, 0, w, h)

    rafRef.current = requestAnimationFrame(renderFrame)  // ~60fps
}
```

The `latestResultRef` is a React ref (not state) — it updates immediately when inference results arrive without re-rendering the component. This decouples the 60fps render loop from the ~1fps inference result updates.

---

## 14. Configuration Reference

### `backend/config.py` — Fixed Constants

| Constant | Value | Description |
|---|---|---|
| `NUM_FRAMES` | 16 | Frames fed to model per inference |
| `IMG_SIZE` | 224 | Spatial resolution after resize |
| `FRAME_SKIP` | 3 | Default frame skip (video upload + RTSP) |
| `DISABLE_STAGE2` | False | Set True to skip Fight/Robbery/Accident classification |
| `EMAIL_ENABLED` | True | Set False to disable all email alerts |
| `FIREBASE_DB_URL` | `https://smart-surveillance-syste-900b5-default-rtdb.firebaseio.com` | Firebase |
| `CLOUDINARY_CLOUD_NAME` | `diubedshx` | Cloudinary account |
| `ALLOWED_ORIGINS` | localhost:5173, :3000, 127.0.0.1:5173, :3000 | CORS |

### `backend/settings.json` — Runtime-Editable

| Key | Default | Changed via |
|---|---|---|
| `anomaly_threshold` | 0.75 | Settings page |
| `sequence_length` | 48 | Settings page |
| `fps_sample` | 3 | Settings page |
| `voting_window` | 3 | Settings page |
| `sender_email` | (from config) | Settings page |
| `receiver_email` | (from config) | Settings page |
| `sender_password` | (from config) | Settings page |

### `frontend/src/config.js`

```javascript
BACKEND_HTTP = 'http://127.0.0.1:8000'
BACKEND_WS   = 'ws://127.0.0.1:8000'
```

Change these when deploying to a server with a real IP/domain.

---

*Last updated: June 2026*
