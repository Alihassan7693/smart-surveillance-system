import json
import logging
import os
import re
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/settings", tags=["settings"])

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SETTINGS_FILE = os.path.join(BASE_DIR, "settings.json")
CONFIG_FILE = os.path.join(BASE_DIR, "config.py")


def detect_file_encoding(filepath):
    """Detect file encoding"""
    encodings = ["utf-8", "latin-1", "cp1252", "iso-8859-1"]
    for encoding in encodings:
        try:
            with open(filepath, 'r', encoding=encoding) as f:
                f.read()
            return encoding
        except (UnicodeDecodeError, LookupError):
            continue
    return "utf-8"  # fallback


class EmailSettingsRequest(BaseModel):
    receiver_email: str | None = None
    sender_email: str | None = None
    sender_password: str | None = None


class EmailSettingsResponse(BaseModel):
    receiver_email: str
    sender_email: str
    sender_password: str = ""
    message: str = "Settings updated successfully"


class DetectionSettingsRequest(BaseModel):
    anomaly_threshold: float | None = None
    # Video upload
    upload_sequence_length: int | None = None
    upload_voting_window: int | None = None
    # Webcam
    webcam_consecutive_threshold: int | None = None
    # RTSP
    rtsp_sequence_length: int | None = None
    rtsp_consecutive_threshold: int | None = None


class DetectionSettingsResponse(BaseModel):
    anomaly_threshold: float
    # Video upload
    upload_sequence_length: int
    upload_voting_window: int
    # Webcam
    webcam_consecutive_threshold: int
    # RTSP
    rtsp_sequence_length: int
    rtsp_consecutive_threshold: int
    message: str = "Settings updated successfully"


def validate_email(email: str) -> bool:
    """Basic email validation"""
    pattern = r'^[^\s@]+@[^\s@]+\.[^\s@]+$'
    return re.match(pattern, email) is not None


def verify_token(authorization: str = Header(None)):
    """Simple token verification"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    try:
        import jwt
        from config import JWT_SECRET
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        role = payload.get("role")
        if role != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        return payload
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


def load_settings():
    """Load settings from file, return defaults if file doesn't exist"""
    if os.path.exists(SETTINGS_FILE):
        try:
            encoding = detect_file_encoding(SETTINGS_FILE)
            with open(SETTINGS_FILE, "r", encoding=encoding) as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Could not load settings file: {e}")
            pass
    
    # Return default values when settings.json is missing
    from config import RECEIVER_EMAIL, SENDER_EMAIL, SENDER_PASSWORD
    return {
        "receiver_email":              RECEIVER_EMAIL,
        "sender_email":                SENDER_EMAIL,
        "sender_password":             SENDER_PASSWORD,
        "anomaly_threshold":           0.5,
        # Video upload
        "upload_sequence_length":      48,
        "upload_voting_window":        3,
        # Webcam
        "webcam_consecutive_threshold": 2,
        # RTSP
        "rtsp_sequence_length":        48,
        "rtsp_consecutive_threshold":  2,
    }


def save_settings(settings: dict):
    """Save settings to file"""
    try:
        os.makedirs(os.path.dirname(SETTINGS_FILE) or ".", exist_ok=True)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
        logger.info(f"Settings saved to JSON: {list(settings.keys())}")
        return True
    except Exception as e:
        logger.error(f"Failed to save settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save settings: {str(e)}")



@router.get("/email", response_model=EmailSettingsResponse)
def get_email_settings(authorized: bool = Depends(verify_token)):
    """Get current email settings"""
    settings = load_settings()
    return EmailSettingsResponse(
        receiver_email=settings.get("receiver_email", ""),
        sender_email=settings.get("sender_email", ""),
        sender_password=settings.get("sender_password", ""),
        message="Settings loaded successfully"
    )


@router.put("/email", response_model=EmailSettingsResponse)
def update_email_settings(req: EmailSettingsRequest, authorized: bool = Depends(verify_token)):
    """Update email settings (receiver, sender email, and password)"""
    
    if not req.receiver_email and not req.sender_email and not req.sender_password:
        raise HTTPException(status_code=400, detail="At least one setting must be provided")
    
    settings = load_settings()
    updated = False
    
    if req.receiver_email is not None:
        if not req.receiver_email.strip():
            raise HTTPException(status_code=400, detail="Receiver email cannot be empty")
        if not validate_email(req.receiver_email):
            raise HTTPException(status_code=400, detail="Invalid receiver email format")
        settings["receiver_email"] = req.receiver_email
        updated = True
    
    if req.sender_email is not None:
        if not req.sender_email.strip():
            raise HTTPException(status_code=400, detail="Sender email cannot be empty")
        if not validate_email(req.sender_email):
            raise HTTPException(status_code=400, detail="Invalid sender email format")
        settings["sender_email"] = req.sender_email
        updated = True
    
    if req.sender_password is not None:
        if not req.sender_password.strip():
            raise HTTPException(status_code=400, detail="Sender password cannot be empty")
        settings["sender_password"] = req.sender_password
        updated = True
    
    if updated:
        # Save to settings.json only
        save_settings(settings)
    
    return EmailSettingsResponse(
        receiver_email=settings.get("receiver_email", ""),
        sender_email=settings.get("sender_email", ""),
        sender_password=settings.get("sender_password", ""),
        message="Email settings updated successfully in settings.json"
    )


@router.get("/detection", response_model=DetectionSettingsResponse)
def get_detection_settings(authorized: bool = Depends(verify_token)):
    """Get current detection settings"""
    s = load_settings()
    return DetectionSettingsResponse(
        anomaly_threshold           = s.get("anomaly_threshold", 0.5),
        upload_sequence_length      = s.get("upload_sequence_length", s.get("sequence_length", 48)),
        upload_voting_window        = s.get("upload_voting_window",   s.get("voting_window",  3)),
        webcam_consecutive_threshold= s.get("webcam_consecutive_threshold", 2),
        rtsp_sequence_length        = s.get("rtsp_sequence_length",  s.get("sequence_length", 48)),
        rtsp_consecutive_threshold  = s.get("rtsp_consecutive_threshold", 2),
        message="Detection settings loaded successfully"
    )


@router.put("/detection", response_model=DetectionSettingsResponse)
def update_detection_settings(req: DetectionSettingsRequest, authorized: bool = Depends(verify_token)):
    """Update detection settings"""
    all_none = all(v is None for v in [
        req.anomaly_threshold,
        req.upload_sequence_length, req.upload_voting_window,
        req.webcam_consecutive_threshold,
        req.rtsp_sequence_length, req.rtsp_consecutive_threshold,
    ])
    if all_none:
        raise HTTPException(status_code=400, detail="At least one detection setting must be provided")

    s = load_settings()

    if req.anomaly_threshold is not None:
        if not (0 <= req.anomaly_threshold <= 1):
            raise HTTPException(status_code=400, detail="Anomaly threshold must be between 0 and 1")
        s["anomaly_threshold"] = req.anomaly_threshold

    if req.upload_sequence_length is not None:
        if req.upload_sequence_length <= 0:
            raise HTTPException(status_code=400, detail="Upload sequence length must be > 0")
        s["upload_sequence_length"] = int(req.upload_sequence_length)

    if req.upload_voting_window is not None:
        if req.upload_voting_window <= 0:
            raise HTTPException(status_code=400, detail="Upload voting window must be > 0")
        s["upload_voting_window"] = int(req.upload_voting_window)

    if req.webcam_consecutive_threshold is not None:
        if req.webcam_consecutive_threshold <= 0:
            raise HTTPException(status_code=400, detail="Webcam consecutive threshold must be > 0")
        s["webcam_consecutive_threshold"] = int(req.webcam_consecutive_threshold)

    if req.rtsp_sequence_length is not None:
        if req.rtsp_sequence_length <= 0:
            raise HTTPException(status_code=400, detail="RTSP sequence length must be > 0")
        s["rtsp_sequence_length"] = int(req.rtsp_sequence_length)

    if req.rtsp_consecutive_threshold is not None:
        if req.rtsp_consecutive_threshold <= 0:
            raise HTTPException(status_code=400, detail="RTSP consecutive threshold must be > 0")
        s["rtsp_consecutive_threshold"] = int(req.rtsp_consecutive_threshold)

    save_settings(s)

    return DetectionSettingsResponse(
        anomaly_threshold            = s.get("anomaly_threshold", 0.5),
        upload_sequence_length       = s.get("upload_sequence_length", 48),
        upload_voting_window         = s.get("upload_voting_window",   3),
        webcam_consecutive_threshold = s.get("webcam_consecutive_threshold", 2),
        rtsp_sequence_length         = s.get("rtsp_sequence_length",  48),
        rtsp_consecutive_threshold   = s.get("rtsp_consecutive_threshold",  2),
        message="Detection settings updated successfully"
    )


@router.post("/test-email")
def test_email(authorized: bool = Depends(verify_token)):
    """Send a test email and return the exact SMTP error if it fails."""
    import smtplib
    from services.alert_service import get_email_settings
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    sender_email, receiver_email, sender_password = get_email_settings()

    if not sender_email or not sender_password or not receiver_email:
        return {
            "success": False,
            "message": f"Missing credentials — sender={sender_email!r}, receiver={receiver_email!r}, password set={bool(sender_password)}",
        }

    try:
        msg = MIMEMultipart()
        msg["From"]    = sender_email
        msg["To"]      = receiver_email
        msg["Subject"] = "Smart Surveillance — Test Email"
        msg.attach(MIMEText("This is a test email from your Smart Surveillance system.", "plain"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, receiver_email, msg.as_string())

        return {"success": True, "message": f"Test email sent from {sender_email} to {receiver_email}. Check your inbox."}

    except smtplib.SMTPAuthenticationError as e:
        return {
            "success": False,
            "message": (
                f"SMTP authentication failed for {sender_email}. "
                f"The App Password is wrong or not generated for this account. "
                f"Go to myaccount.google.com → Security → App Passwords and generate one for '{sender_email}'. "
                f"Raw error: {e}"
            ),
        }
    except Exception as e:
        return {"success": False, "message": f"SMTP error: {e}"}
