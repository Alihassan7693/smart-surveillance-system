import logging
import os

import cloudinary
import cloudinary.uploader

from config import CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

logger = logging.getLogger(__name__)

cloudinary.config(
    cloud_name = CLOUDINARY_CLOUD_NAME,
    api_key    = CLOUDINARY_API_KEY,
    api_secret = CLOUDINARY_API_SECRET,
    secure     = True,
)


def upload_clip_to_storage(local_path: str) -> str | None:
    """
    Upload an anomaly clip to Cloudinary.
    Returns the public HTTPS URL, or None if upload fails.
    Clips are stored under the 'anomaly_clips' folder in Cloudinary.
    """
    if not local_path or not os.path.exists(local_path):
        logger.warning(f"upload_clip_to_storage: file not found: {local_path}")
        return None

    try:
        filename   = os.path.splitext(os.path.basename(local_path))[0]
        result     = cloudinary.uploader.upload(
            local_path,
            resource_type = "video",
            folder        = "anomaly_clips",
            public_id     = filename,
            overwrite     = True,
        )
        # Insert H.264 transcode transformation so the URL plays in all browsers.
        # Cloudinary transcodes on first access and caches the result.
        url = result["secure_url"].replace("/upload/", "/upload/vc_h264/")
        logger.info(f"Clip uploaded to Cloudinary: {url}")

        # Delete local file — Cloudinary is now the only copy
        try:
            os.remove(local_path)
            logger.info(f"Local clip deleted after upload: {local_path}")
        except OSError as del_err:
            logger.warning(f"Could not delete local clip: {del_err}")

        return url

    except Exception as exc:
        logger.error(f"Cloudinary upload failed: {exc}", exc_info=True)
        # Upload failed — keep local file as fallback
        logger.info("Local clip kept as fallback (upload failed)")
        return None
