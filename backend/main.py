import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import ALLOWED_ORIGINS, CLIPS_DIR, TEMP_DIR, DISABLE_STAGE2
from database.firebase_client import init_firebase
from models.model_manager import model_manager
from routers.auth_router import router as auth_router
from routers.detection_router import router as detection_router
from routers.settings_router import router as settings_router
from routers.stream_router import router as stream_router
from routers.video_router import router as video_router
from routers.admin_router import router as admin_router
from routers.alerts_router import router as alerts_router
from routers.system_settings_router import router as system_settings_router
from routers.reports_router import router as reports_router

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.abspath(os.path.join(BASE_DIR, '..', 'frontend', 'dist'))
FRONTEND_INDEX = os.path.join(FRONTEND_DIST, 'index.html')

# ─── Logging ───────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Ensure dirs exist ─────────────────────────────────────────────────────
os.makedirs(CLIPS_DIR, exist_ok=True)
os.makedirs(TEMP_DIR,  exist_ok=True)


# ─── Startup / Shutdown ────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("═══════ Smart Surveillance System — Starting ═══════")
    model_manager.load_models()
    init_firebase()
    logger.info("═══════ Startup complete ═══════")
    yield
    logger.info("═══════ Shutdown ═══════")


# ─── App ───────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Smart Surveillance System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ───────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(alerts_router)
app.include_router(system_settings_router)
app.include_router(reports_router)
app.include_router(settings_router)
app.include_router(video_router)
app.include_router(stream_router)
app.include_router(detection_router)

# Serve saved clip files statically
app.mount("/clips", StaticFiles(directory=CLIPS_DIR), name="clips")

if os.path.isdir(os.path.join(FRONTEND_DIST, 'assets')):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, 'assets')), name="assets")


@app.get("/")
def root():
    if not os.path.isfile(FRONTEND_INDEX):
        raise HTTPException(status_code=404, detail="Frontend build not found")
    return FileResponse(FRONTEND_INDEX)


# ─── Health check ──────────────────────────────────────────────────────────
@app.get("/health")
def health():
    # If models are not ready, try to load them before reporting status.
    if not model_manager.ready:
        model_manager.load_models()

    return {
        "status":        "ok",
        "models_loaded": model_manager.ready,
        "stage1_ready":  model_manager.stage1_ready,
        "stage2_ready":  model_manager.stage2_ready,
        "disable_stage2": DISABLE_STAGE2,
        "device":        str(model_manager.device),
    }


@app.get("/{full_path:path}")
def spa(full_path: str):
    if full_path.startswith('api') or full_path.startswith('docs') or full_path.startswith('_') or full_path == 'health':
        raise HTTPException(status_code=404)
    if not os.path.isfile(FRONTEND_INDEX):
        raise HTTPException(status_code=404, detail="Frontend build not found")
    return FileResponse(FRONTEND_INDEX)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
