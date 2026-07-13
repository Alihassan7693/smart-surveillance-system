# User and data models for Firestore
from datetime import datetime
from typing import Optional, List
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    SECURITY_PERSONNEL = "security_personnel"
    USER = "user"

class User:
    def __init__(self, user_id: str, name: str, email: str, password_hash: str, role: UserRole, badge_id: Optional[str] = None, active: bool = True):
        self.user_id = user_id
        self.name = name
        self.email = email
        self.password_hash = password_hash
        self.role = role
        self.badge_id = badge_id
        self.active = active
        self.created_at = datetime.now()
        self.updated_at = datetime.now()
    
    def to_dict(self):
        return {
            "user_id": self.user_id,
            "name": self.name,
            "email": self.email,
            "role": self.role.value,
            "badge_id": self.badge_id,
            "active": self.active,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

class Camera:
    def __init__(self, camera_id: str, name: str, ip_address: str, location: str, rtsp_link: str, status: str = "active"):
        self.camera_id = camera_id
        self.name = name
        self.ip_address = ip_address
        self.location = location
        self.rtsp_link = rtsp_link
        self.status = status
        self.created_at = datetime.now()
    
    def to_dict(self):
        return {
            "camera_id": self.camera_id,
            "name": self.name,
            "ip_address": self.ip_address,
            "location": self.location,
            "rtsp_link": self.rtsp_link,
            "status": self.status,
            "created_at": self.created_at,
        }

class AnomalyEvent:
    def __init__(self, event_id: str, camera_id: str, anomaly_type: str, confidence: float, timestamp: datetime, status: str = "pending"):
        self.event_id = event_id
        self.camera_id = camera_id
        self.anomaly_type = anomaly_type
        self.confidence = confidence
        self.timestamp = timestamp
        self.status = status  # pending, acknowledged, resolved
        self.created_at = datetime.now()
    
    def to_dict(self):
        return {
            "event_id": self.event_id,
            "camera_id": self.camera_id,
            "anomaly_type": self.anomaly_type,
            "confidence": self.confidence,
            "timestamp": self.timestamp,
            "status": self.status,
            "created_at": self.created_at,
        }

class IncidentLog:
    def __init__(self, log_id: str, camera_id: str, incident_type: str, description: str, resolved: bool = False):
        self.log_id = log_id
        self.camera_id = camera_id
        self.incident_type = incident_type
        self.description = description
        self.resolved = resolved
        self.created_at = datetime.now()
        self.resolved_at: Optional[datetime] = None
    
    def to_dict(self):
        return {
            "log_id": self.log_id,
            "camera_id": self.camera_id,
            "incident_type": self.incident_type,
            "description": self.description,
            "resolved": self.resolved,
            "created_at": self.created_at,
            "resolved_at": self.resolved_at,
        }

class Settings:
    def __init__(self, setting_id: str = "default"):
        self.setting_id = setting_id
        self.alert_threshold = 0.75
        self.retention_days = 30
        self.notify_enabled = True
        self.alert_email = ""
        self.sms_number = ""
        self.updated_at = datetime.now()
    
    def to_dict(self):
        return {
            "setting_id": self.setting_id,
            "alert_threshold": self.alert_threshold,
            "retention_days": self.retention_days,
            "notify_enabled": self.notify_enabled,
            "alert_email": self.alert_email,
            "sms_number": self.sms_number,
            "updated_at": self.updated_at,
        }
