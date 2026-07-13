"""
inference_pipeline.py
─────────────────────
Two-stage inference for live video clips.

Stage 1 — Detector  : Normal vs Anomaly
Stage 2 — Classifier: Fight / Robbery / Accident  (only called when anomaly detected)

Preprocessing mirrors the *validation* transform used during training:
    BGR → RGB  →  resize 224×224  →  ImageNet normalise
    Frame sampling: every FRAME_SKIP-th frame until NUM_FRAMES collected.
"""

import cv2
import torch
import numpy as np
from torchvision import transforms

from config import NUM_FRAMES, IMG_SIZE, FRAME_SKIP

_IMAGENET_MEAN = [0.485, 0.456, 0.406]
_IMAGENET_STD  = [0.229, 0.224, 0.225]

_val_transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(mean=_IMAGENET_MEAN, std=_IMAGENET_STD),
])


def _sample_frames(frames: list, frame_skip: int = FRAME_SKIP) -> list:
    """
    Pick NUM_FRAMES evenly-spaced frames using frame_skip.

    frame_skip=3 (default) → matches training on ~30fps video
    frame_skip=1           → matches webcam captured at 10fps
    Falls back to uniform sampling when buffer is shorter than ideal.
    """
    total  = len(frames)
    needed = NUM_FRAMES * frame_skip

    if total >= needed:
        indices = [i * frame_skip for i in range(NUM_FRAMES)]
    else:
        indices = np.linspace(0, total - 1, NUM_FRAMES, dtype=int).tolist()

    sampled = [frames[i] for i in indices]

    while len(sampled) < NUM_FRAMES:
        sampled.append(sampled[-1])

    return sampled[:NUM_FRAMES]


def preprocess_clip(frames: list, frame_skip: int = FRAME_SKIP) -> torch.Tensor:
    """
    Convert a list of BGR uint8 frames into a model-ready tensor.

    Returns:
        Tensor of shape (1, C, T, H, W) = (1, 3, NUM_FRAMES, IMG_SIZE, IMG_SIZE)
        ready to pass directly to either model's forward().
    """
    sampled = _sample_frames(frames, frame_skip=frame_skip)

    tensors = []
    for frame in sampled:
        rgb     = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (IMG_SIZE, IMG_SIZE))
        tensors.append(_val_transform(resized))   # (3, H, W)

    clip = torch.stack(tensors, dim=0)      # (T, 3, H, W)
    clip = clip.permute(1, 0, 2, 3)         # (C, T, H, W)
    clip = clip.unsqueeze(0)                # (1, C, T, H, W)
    return clip


def run_inference(frames: list, model_manager, frame_skip: int = FRAME_SKIP) -> dict:
    """
    Run the two-stage inference pipeline on a video clip.

    Stage 1 — Detector  : always runs when stage1 is loaded.
    Stage 2 — Classifier: only runs if Stage 1 flags an anomaly.

    Pipeline:
        Video clip
            ↓
        Stage 1 (Detector)
            ↓
        if Anomaly detected:
            Stage 2 (Classifier)  →  Fight / Robbery / Accident

    Args:
        frames:        List of BGR numpy arrays captured from the video stream.
        model_manager: ModelManager instance with loaded models.

    Returns:
        dict:
            is_anomaly       (bool)       — anomaly detected?
            stage1_conf      (float)      — detector confidence [0-1]
            anomaly_class    (str|None)   — classified type, or None
            stage2_conf      (float|None) — classifier confidence [0-1]
            anomaly_classes_probs (dict)  — per-class probabilities from stage 2
    """
    from config import DISABLE_STAGE2, STAGE2_CLASSES
    from routers.settings_router import load_settings

    settings          = load_settings()
    ANOMALY_THRESHOLD = settings.get("anomaly_threshold", 0.5)

    device = model_manager.device
    clip   = preprocess_clip(frames, frame_skip=frame_skip).to(device)   # (1, 3, 16, 224, 224)

    result = {
        "is_anomaly":            False,
        "stage1_conf":           0.0,
        "anomaly_class":         None,
        "stage2_conf":           None,
        "anomaly_classes_probs": {},
    }

    with torch.no_grad():
        # ── Stage 1: Anomaly Detection ───────────────────────────────────────
        if model_manager.stage1_ready:
            try:
                logits1 = model_manager.stage1(clip)            # (1, 2)
                if logits1.dim() == 1:
                    logits1 = logits1.unsqueeze(0)

                probs1           = torch.softmax(logits1, dim=1)[0]
                anomaly_prob     = probs1[1].item()             # index 1 = Anomaly
                result["stage1_conf"] = anomaly_prob
                result["is_anomaly"]  = anomaly_prob >= ANOMALY_THRESHOLD
            except Exception as exc:
                import logging
                logging.getLogger(__name__).error(f"Stage-1 inference failed: {exc}")

        # ── Stage 2: Anomaly Classification ──────────────────────────────────
        if result["is_anomaly"] and model_manager.stage2_ready and not DISABLE_STAGE2:
            try:
                logits2 = model_manager.stage2(clip)            # (1, 3)
                if logits2.dim() == 1:
                    logits2 = logits2.unsqueeze(0)

                probs2     = torch.softmax(logits2, dim=1)[0]
                class_idx  = torch.argmax(probs2).item()
                class_conf = probs2[class_idx].item()

                result["anomaly_class"] = STAGE2_CLASSES[class_idx]
                result["stage2_conf"]   = class_conf
                result["anomaly_classes_probs"] = {
                    STAGE2_CLASSES[i]: float(probs2[i].item())
                    for i in range(len(STAGE2_CLASSES))
                }
            except Exception as exc:
                import logging
                logging.getLogger(__name__).error(f"Stage-2 inference failed: {exc}")

    return result
