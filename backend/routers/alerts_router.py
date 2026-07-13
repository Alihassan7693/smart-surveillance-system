from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
import uuid

from database.firebase_client import db
from database.detection_repository import normalize_anomaly_type

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class AlertResponse(BaseModel):
    alert_id: str
    camera_id: str
    anomaly_type: str
    confidence: float
    timestamp: str
    status: str  # pending, acknowledged, resolved
    camera_name: Optional[str] = None


class IncidentResponse(BaseModel):
    log_id: str
    camera_id: str
    incident_type: str
    description: str
    resolved: bool
    created_at: str
    resolved_at: Optional[str] = None
    camera_name: Optional[str] = None


@router.get("/anomalies", response_model=List[AlertResponse])
def get_anomalies(
    skip: int = Query(0),
    limit: int = Query(10),
    anomaly_type: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias='status'),
    camera_id: Optional[str] = None,
):
    """Get anomaly alerts with filtering"""
    try:
        alerts = []
        normalized_filter = normalize_anomaly_type(anomaly_type) if anomaly_type else None

        for doc in db.collection('detections').stream():
            alert_data = doc.to_dict()
            alert_status = alert_data.get('status', 'pending')
            alert_type = alert_data.get('anomaly_type', '')
            alert_type_norm = normalize_anomaly_type(alert_type)
            alert_camera = alert_data.get('camera_id') or alert_data.get('clip_file') or ''

            if normalized_filter and alert_type_norm != normalized_filter:
                continue
            if status_filter and alert_status != status_filter:
                continue
            if camera_id and alert_camera != camera_id:
                continue

            alerts.append(AlertResponse(
                alert_id=alert_data.get('id') or getattr(doc, 'id', None),
                camera_id=alert_camera,
                anomaly_type=alert_type_norm,
                confidence=alert_data.get('confidence', 0),
                timestamp=str(alert_data.get('timestamp', datetime.now())),
                status=alert_status,
            ))

        alerts.sort(key=lambda a: a.timestamp or '', reverse=True)
        return alerts[skip: skip + limit]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/anomalies/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: str):
    """Mark anomaly as acknowledged"""
    try:
        db.collection('detections').document(alert_id).update({
            'status': 'acknowledged',
            'updated_at': datetime.now().isoformat(),
        })
        return {"message": "Alert acknowledged"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/incidents", response_model=List[IncidentResponse])
def get_incidents(
    skip: int = Query(0),
    limit: int = Query(10),
    incident_type: Optional[str] = None,
    resolved: Optional[bool] = None,
    camera_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
):
    """Get incident logs with filtering and search"""
    try:
        query = db.collection('incident_logs')
        
        if incident_type:
            query = query.where('incident_type', '==', incident_type)
        if resolved is not None:
            query = query.where('resolved', '==', resolved)
        if camera_id:
            query = query.where('camera_id', '==', camera_id)
        
        # Order by date descending
        query = query.order_by('created_at', direction='DESCENDING').offset(skip).limit(limit)
        
        incidents = []
        for doc in query.stream():
            incident_data = doc.to_dict()
            
            # Apply search filter if provided
            if search:
                search_fields = [
                    incident_data.get('description', '').lower(),
                    incident_data.get('incident_type', '').lower(),
                ]
                if not any(search.lower() in field for field in search_fields):
                    continue
            
            incidents.append(IncidentResponse(
                log_id=incident_data.get('log_id'),
                camera_id=incident_data.get('camera_id'),
                incident_type=incident_data.get('incident_type'),
                description=incident_data.get('description'),
                resolved=incident_data.get('resolved', False),
                created_at=str(incident_data.get('created_at', datetime.now())),
                resolved_at=str(incident_data.get('resolved_at')) if incident_data.get('resolved_at') else None,
            ))
        
        return incidents
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/incidents/{incident_id}/resolve")
def mark_incident_resolved(incident_id: str):
    """Mark incident as resolved"""
    try:
        db.collection('incident_logs').document(incident_id).update({
            'resolved': True,
            'resolved_at': datetime.now().isoformat(),
        })
        return {"message": "Incident marked as resolved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dashboard-stats")
def get_dashboard_stats():
    """Get dashboard statistics"""
    try:
        # Get total detections
        all_detections = db.collection('detections').stream()
        total_detections = len(list(all_detections))
        
        # Count by type
        detection_types = {
            'road_accidents': 0,
            'robbery': 0,
            'anomaly': 0,
            'fighting': 0,
        }
        
        for doc in db.collection('detections').stream():
            alert_data = doc.to_dict()
            anomaly_type = alert_data.get('anomaly_type', '').lower()
            if 'road' in anomaly_type:
                detection_types['road_accidents'] += 1
            elif 'robbery' in anomaly_type:
                detection_types['robbery'] += 1
            elif 'fighting' in anomaly_type:
                detection_types['fighting'] += 1
            else:
                detection_types['anomaly'] += 1
        
        return {
            "total_detections": total_detections,
            "road_accidents": detection_types['road_accidents'],
            "robbery": detection_types['robbery'],
            "anomaly": detection_types['anomaly'],
            "fighting": detection_types['fighting'],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
