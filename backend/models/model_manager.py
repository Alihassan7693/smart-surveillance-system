"""
ModelManager — two-stage inference pipeline

Stage 1 (Detector):   EfficientNet-B0 + BiGRU + Attention  →  Normal vs Anomaly
Stage 2 (Classifier): same architecture                    →  Fight / Robbery / Accident
"""

import logging
import torch
import torch.nn as nn
from config import DISABLE_STAGE2, STAGE1_MODEL_PATH, STAGE2_MODEL_PATH, STAGE2_CLASSES

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────────────────────────
#  Model loaders
# ────────────────────────────────────────────────────────────────────────────

def _extract_state(checkpoint):
    """Return a flat state_dict from various checkpoint formats."""
    if isinstance(checkpoint, dict):
        for key in ('state_dict', 'model_state_dict', 'model'):
            if key in checkpoint:
                return checkpoint[key]
        return checkpoint   # plain state_dict
    return None             # full model object


def _load_detector(path: str, device) -> nn.Module:
    """Load the binary anomaly detector (stage 1)."""
    from models.stage1_model import build_stage1_model

    checkpoint = torch.load(path, map_location=device)
    state = _extract_state(checkpoint)

    if state is None:
        logger.info("  Detector checkpoint is a full model object")
        checkpoint.eval()
        return checkpoint.to(device)

    model = build_stage1_model(gru_hidden=256, gru_layers=2, dropout=0.5)
    result = model.load_state_dict(state, strict=False)
    if result.missing_keys or result.unexpected_keys:
        logger.warning(
            f"  Detector state_dict mismatch — "
            f"missing: {result.missing_keys}, unexpected: {result.unexpected_keys}"
        )
    model.eval()
    return model.to(device)


def _load_classifier(path: str, device) -> nn.Module:
    """Load the 3-class anomaly classifier (stage 2)."""
    from models.stage2_model import build_stage2_model

    checkpoint = torch.load(path, map_location=device)
    state = _extract_state(checkpoint)

    if state is None:
        logger.info("  Classifier checkpoint is a full model object")
        checkpoint.eval()
        return checkpoint.to(device)

    model = build_stage2_model(num_classes=3, gru_hidden=256, gru_layers=2, dropout=0.5)
    result = model.load_state_dict(state, strict=False)
    if result.missing_keys or result.unexpected_keys:
        logger.warning(
            f"  Classifier state_dict mismatch — "
            f"missing: {result.missing_keys}, unexpected: {result.unexpected_keys}"
        )
    model.eval()
    return model.to(device)


# ────────────────────────────────────────────────────────────────────────────
#  Singleton ModelManager
# ────────────────────────────────────────────────────────────────────────────

class ModelManager:
    """Singleton that owns both the detector and classifier models."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.stage1 = None   # anomaly detector   (Normal / Anomaly)
        self.stage2 = None   # anomaly classifier (Fight / Robbery / Accident)
        self._initialized = True

        logger.info("═══════════════════════════════════════════════════════")
        logger.info("  ModelManager initialised")
        logger.info(f"  Device:          {self.device}")
        logger.info(f"  Detector path:   {STAGE1_MODEL_PATH}")
        logger.info(f"  Classifier path: {STAGE2_MODEL_PATH}")
        logger.info("═══════════════════════════════════════════════════════")

    def load_models(self):
        """Load both models from disk."""
        logger.info(f"\nLoading models onto {self.device} ...\n")

        # Stage 1 — Detector
        try:
            self.stage1 = _load_detector(STAGE1_MODEL_PATH, self.device)
            logger.info("✓ Stage-1 Detector loaded  (Normal vs Anomaly)")
        except Exception as exc:
            logger.error(f"✗ Stage-1 Detector failed: {exc}")
            self.stage1 = None

        # Stage 2 — Classifier
        if DISABLE_STAGE2:
            logger.info("→ Stage-2 Classifier disabled by config")
        else:
            try:
                self.stage2 = _load_classifier(STAGE2_MODEL_PATH, self.device)
                logger.info(
                    f"✓ Stage-2 Classifier loaded  "
                    f"(classes: {', '.join(STAGE2_CLASSES)})"
                )
            except Exception as exc:
                logger.error(f"✗ Stage-2 Classifier failed: {exc}")
                self.stage2 = None

        logger.info(f"\n{self.status_summary()}\n")

    def status_summary(self) -> str:
        return (
            "Model Status:\n"
            f"  Detector ready:    {'YES' if self.stage1_ready else 'NO'}\n"
            f"  Classifier ready:  {'YES' if self.stage2_ready else 'NO'}\n"
            f"  System ready:      {'YES' if self.ready else 'NO'}"
        )

    @property
    def ready(self) -> bool:
        return self.stage1 is not None and (self.stage2 is not None or DISABLE_STAGE2)

    @property
    def stage1_ready(self) -> bool:
        return self.stage1 is not None

    @property
    def stage2_ready(self) -> bool:
        return self.stage2 is not None


model_manager = ModelManager()
