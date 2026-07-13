import logging
import os
import smtplib
from datetime import datetime
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from config import EMAIL_ENABLED

logger = logging.getLogger(__name__)


def get_email_settings():
    """Load sender/receiver email and password from settings.json, falling back to config.py."""
    from config import SENDER_EMAIL, RECEIVER_EMAIL, SENDER_PASSWORD
    try:
        from routers.settings_router import load_settings
        s = load_settings()
        sender_email    = (s.get("sender_email")    or "").strip() or SENDER_EMAIL
        receiver_email  = (s.get("receiver_email")  or "").strip() or RECEIVER_EMAIL
        sender_password = (s.get("sender_password") or "").strip() or SENDER_PASSWORD
    except Exception as e:
        logger.warning(f"Could not load settings, using config defaults: {e}")
        sender_email, receiver_email, sender_password = SENDER_EMAIL, RECEIVER_EMAIL, SENDER_PASSWORD
    logger.info(f"Email settings — sender: {sender_email}  receiver: {receiver_email}")
    return sender_email, receiver_email, sender_password


def send_alert_email(
    anomaly_type: str,
    confidence: float,
    clip_path: str | None = None,
) -> bool:
    """
    Send Gmail SMTP alert.
    Attaches the anomaly video clip when clip_path is provided.
    Returns True on success.
    """
    if not EMAIL_ENABLED:
        logger.info("Email disabled — skipping alert")
        return False

    sender_email, receiver_email, sender_password = get_email_settings()
    
    try:
        msg            = MIMEMultipart()
        msg["From"]    = sender_email
        msg["To"]      = receiver_email
        msg["Subject"] = f"🚨 ANOMALY DETECTED: {anomaly_type.upper()}"

        body = (
            "Smart Surveillance System — ANOMALY ALERT\n"
            "==========================================\n"
            f"Detection Time : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"Anomaly Type   : {anomaly_type.upper()}\n"
            f"Confidence     : {confidence:.1%}\n\n"
            "An anomalous activity has been detected in the surveillance feed.\n"
            "Please review the attached video clip immediately.\n\n"
            "— Smart Surveillance System"
        )
        msg.attach(MIMEText(body, "plain"))

        # Attach video clip if available
        if clip_path and os.path.exists(clip_path):
            with open(clip_path, "rb") as f:
                part = MIMEBase("application", "octet-stream")
                part.set_payload(f.read())
            encoders.encode_base64(part)
            part.add_header(
                "Content-Disposition",
                f'attachment; filename="{os.path.basename(clip_path)}"',
            )
            msg.attach(part)

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, receiver_email, msg.as_string())

        logger.info(f"Alert email sent → {receiver_email}  [{anomaly_type}]")
        return True

    except Exception as exc:
        logger.error(f"Email send failed: {exc}")
        return False
