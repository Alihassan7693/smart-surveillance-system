import os

from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Load secrets from backend/.env (never committed — see .env.example)
load_dotenv(os.path.join(BASE_DIR, ".env"))


def _env_bool(name: str, default: str = "true") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")
SAVED_MODELS_DIR = os.path.join(BASE_DIR, "saved_models")
CLIPS_DIR = os.path.join(BASE_DIR, "clips")
TEMP_DIR = os.path.join(BASE_DIR, "temp")
FIREBASE_CREDENTIALS = os.path.join(BASE_DIR, "firebase_credentials.json")

# ─────────────────────────────────────────────
#  CORS SETTINGS
# ─────────────────────────────────────────────
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# ─────────────────────────────────────────────
#  MODEL PATHS
# ─────────────────────────────────────────────

def _resolve_model_path(candidates):
    for filename in candidates:
        path = os.path.join(SAVED_MODELS_DIR, filename)
        if os.path.exists(path):
            return path
    return os.path.join(SAVED_MODELS_DIR, candidates[0])


# Stage 1: Binary anomaly detector (Normal vs Anomaly)
# Architecture: EfficientNet-B0 + Bidirectional GRU + Attention
STAGE1_MODEL_PATH = _resolve_model_path(["modelA_best .pth", "modelA_best (1).pth", "modelA_best.pth", "modelA_last.pth"])

# Stage 2: 3-class anomaly classifier (Fight / Robbery / Accident)
# Architecture: same as Stage 1 but 3 output classes
STAGE2_MODEL_PATH = _resolve_model_path(["model3c_best.pth", "model3c_last.pth"])

# ─────────────────────────────────────────────
#  CLASS NAMES  (must match training order!)
# ─────────────────────────────────────────────
# Stage 1: binary — index 0 = Normal, index 1 = Anomaly
STAGE1_CLASSES = ['Normal', 'Anomaly']

# Stage 2: 3-class — must match the order used during training
STAGE2_CLASSES = ['Fight', 'Robbery', 'Accident']

# ─────────────────────────────────────────────
#  INFERENCE / PREPROCESSING SETTINGS
# ─────────────────────────────────────────────
# These match the validation preprocessing used during training exactly.
NUM_FRAMES  = 16   # frames fed to the model per clip
IMG_SIZE    = 224  # spatial resolution (224×224)
FRAME_SKIP  = 3    # collect every FRAME_SKIP-th raw frame → effective window ≈1.6 s at 30 fps

DISABLE_STAGE2 = False   # set True to skip classification and only run detection

# ─────────────────────────────────────────────
#  EMAIL (Gmail SMTP)          — values come from .env
# ─────────────────────────────────────────────
SENDER_EMAIL    = os.getenv("SENDER_EMAIL", "")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD", "")   # Gmail App Password
RECEIVER_EMAIL  = os.getenv("RECEIVER_EMAIL", "")
EMAIL_ENABLED   = _env_bool("EMAIL_ENABLED", "true")

# ─────────────────────────────────────────────
#  FIREBASE                    — values come from .env
# ─────────────────────────────────────────────
FIREBASE_DB_URL      = os.getenv("FIREBASE_DB_URL", "")
FIREBASE_CREDENTIALS = os.path.join(BASE_DIR, "firebase_credentials.json")
FIREBASE_ENABLED     = _env_bool("FIREBASE_ENABLED", "true")   # set False if no credentials file

# ─────────────────────────────────────────────
#  CLOUDINARY (video clip storage)  — values come from .env
# ─────────────────────────────────────────────
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY    = os.getenv("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")

# ─────────────────────────────────────────────
#  AUTH (simple)               — values come from .env
# ─────────────────────────────────────────────
ADMIN_USERNAME   = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD   = os.getenv("ADMIN_PASSWORD", "admin123")
JWT_SECRET       = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

