from datetime import datetime
from fastapi import APIRouter, HTTPException, Body, Depends
from pydantic import BaseModel
from typing import Optional

from database.firebase_client import db
from routers.auth_router import require_admin

router = APIRouter(prefix="/api/settings", tags=["settings"])


class CameraRequest(BaseModel):
    name: str
    ip_address: str
    rtsp_link: str
    location: str


class DetectionSettingsRequest(BaseModel):
    alert_threshold: Optional[float] = None
    retention_days: Optional[int] = None
    notify_enabled: Optional[bool] = None


class NotificationSettingsRequest(BaseModel):
    alert_email: Optional[str] = None
    sms_number: Optional[str] = None


class SettingsResponse(BaseModel):
    alert_threshold: float
    retention_days: int
    notify_enabled: bool
    alert_email: str
    sms_number: str


@router.get("/cameras")
def get_all_cameras(current_user: dict = Depends(require_admin)):
    """Get all configured cameras"""
    try:
        cameras = []
        for doc in db.collection('cameras').stream():
            camera_data = doc.to_dict()
            cameras.append(camera_data)
        return cameras
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cameras")
def add_camera(camera: CameraRequest, current_user: dict = Depends(require_admin)):
    """Add new camera - Admin only"""
    try:
        import uuid
        camera_id = str(uuid.uuid4())
        camera_data = {
            'camera_id': camera_id,
            'name': camera.name,
            'ip_address': camera.ip_address,
            'rtsp_link': camera.rtsp_link,
            'location': camera.location,
            'status': 'active',
            'created_at': datetime.now().isoformat(),
        }
        
        db.collection('cameras').document(camera_id).set(camera_data)
        return {"message": "Camera added successfully", "camera_id": camera_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/cameras/{camera_id}")
def delete_camera(camera_id: str, current_user: dict = Depends(require_admin)):
    """Delete camera - Admin only"""
    try:
        db.collection('cameras').document(camera_id).delete()
        return {"message": "Camera deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/system", response_model=SettingsResponse)
def get_system_settings(current_user: dict = Depends(require_admin)):
    """Get system settings"""
    try:
        settings_doc = db.collection('settings').document('default').get()
        
        if settings_doc.exists:
            settings_data = settings_doc.to_dict()
        else:
            # Return defaults
            settings_data = {
                'alert_threshold': 0.75,
                'retention_days': 30,
                'notify_enabled': True,
                'alert_email': '',
                'sms_number': '',
            }
        
        return SettingsResponse(
            alert_threshold=settings_data.get('alert_threshold', 0.75),
            retention_days=settings_data.get('retention_days', 30),
            notify_enabled=settings_data.get('notify_enabled', True),
            alert_email=settings_data.get('alert_email', ''),
            sms_number=settings_data.get('sms_number', ''),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/system/detection")
def update_detection_settings(settings: DetectionSettingsRequest, current_user: dict = Depends(require_admin)):
    """Update detection settings - Admin only"""
    try:
        update_data = {}
        if settings.alert_threshold is not None:
            update_data['alert_threshold'] = settings.alert_threshold
        if settings.retention_days is not None:
            update_data['retention_days'] = settings.retention_days
        if settings.notify_enabled is not None:
            update_data['notify_enabled'] = settings.notify_enabled
        
        update_data['updated_at'] = datetime.now().isoformat()
        db.collection('settings').document('default').set(update_data, merge=True)
        
        return {"message": "Detection settings updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/system/notifications")
def update_notification_settings(settings: NotificationSettingsRequest, current_user: dict = Depends(require_admin)):
    """Update notification settings - Admin only"""
    try:
        update_data = {}
        if settings.alert_email is not None:
            update_data['alert_email'] = settings.alert_email
        if settings.sms_number is not None:
            update_data['sms_number'] = settings.sms_number
        
        update_data['updated_at'] = datetime.now().isoformat()
        db.collection('settings').document('default').set(update_data, merge=True)
        
        return {"message": "Notification settings updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/system/reset")
def reset_to_defaults(current_user: dict = Depends(require_admin)):
    """Reset all settings to defaults - Admin only"""
    try:
        default_settings = {
            'alert_threshold': 0.75,
            'retention_days': 30,
            'notify_enabled': True,
            'alert_email': '',
            'sms_number': '',
            'updated_at': datetime.now().isoformat(),
        }
        db.collection('settings').document('default').set(default_settings)
        
        return {"message": "Settings reset to defaults"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
