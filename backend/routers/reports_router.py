from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Optional

from database.firebase_client import db
from database.detection_repository import normalize_anomaly_type

router = APIRouter(prefix="/api/reports", tags=["reports"])


class MonthlyStatsResponse(BaseModel):
    month: str
    year: int
    total_anomalies: int
    fighting: int
    robbery: int
    accident: int
    anomalies_per_day: Dict[int, int]
    anomaly_type_distribution: Dict[str, int]
    anomalies: List[Dict] = []


@router.get("/monthly", response_model=MonthlyStatsResponse)
def get_monthly_report(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2100),
):
    """Get monthly statistics report"""
    try:
        # Create date range for the month
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1)
        else:
            end_date = datetime(year, month + 1, 1)
        
        # Fetch anomalies for the month
        anomalies = []
        for doc in db.collection('detections').where(
            'timestamp', '>=', start_date.isoformat()
        ).where(
            'timestamp', '<', end_date.isoformat()
        ).stream():
            anomalies.append(doc.to_dict())
        
        # Analyze data
        stats = {
            'total': 0,
            'fighting': 0,
            'robbery': 0,
            'accident': 0,
            'per_day': {},
            'by_type': {},
        }

        for anomaly in anomalies:
            stats['total'] += 1
            normalized_type = normalize_anomaly_type(anomaly.get('anomaly_type', ''))

            if normalized_type == 'Fight':
                stats['fighting'] += 1
            elif normalized_type == 'Robbery':
                stats['robbery'] += 1
            elif normalized_type == 'Accident':
                stats['accident'] += 1
            
            stats['by_type'][normalized_type] = stats['by_type'].get(normalized_type, 0) + 1
            
            # Count per day
            timestamp = anomaly.get('timestamp', datetime.now().isoformat())
            if isinstance(timestamp, datetime):
                day = timestamp.day
            else:
                day = datetime.fromisoformat(str(timestamp)).day
            
            if day not in stats['per_day']:
                stats['per_day'][day] = 0
            stats['per_day'][day] += 1
        
        month_names = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December']
        
        return MonthlyStatsResponse(
            month=month_names[month],
            year=year,
            total_anomalies=stats['total'],
            fighting=stats['fighting'],
            robbery=stats['robbery'],
            accident=stats['accident'],
            anomalies_per_day=stats['per_day'],
            anomaly_type_distribution=stats['by_type'],
            anomalies=[
                {
                    "timestamp": str(a.get('timestamp')),
                    "type": a.get('anomaly_type'),
                    "confidence": a.get('confidence'),
                    "camera_id": a.get('camera_id'),
                }
                for a in anomalies[:100]
            ],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary")
def get_summary_statistics(
    days: int = Query(30),
):
    """Get summary statistics for the last N days"""
    try:
        cutoff_date = datetime.now() - timedelta(days=days)
        
        # Fetch data
        anomalies = []
        for doc in db.collection('detections').where(
            'timestamp', '>=', cutoff_date.isoformat()
        ).stream():
            anomalies.append(doc.to_dict())
        
        # Count by type
        stats = {
            'total': len(anomalies),
            'fighting': 0,
            'robbery': 0,
            'road_accidents': 0,
            'anomaly': 0,
            'by_day': {},
        }
        
        for anomaly in anomalies:
            normalized_type = normalize_anomaly_type(anomaly.get('anomaly_type', ''))
            
            if normalized_type == 'Fight':
                stats['fighting'] += 1
            elif normalized_type == 'Robbery':
                stats['robbery'] += 1
            elif normalized_type == 'Accident':
                stats['road_accidents'] += 1
            else:
                stats['anomaly'] += 1
        
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export-pdf")
def export_report_pdf(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2020, le=2100),
):
    """Export monthly report as PDF - Returns report data for frontend to generate PDF"""
    try:
        # Get the monthly data
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1)
        else:
            end_date = datetime(year, month + 1, 1)
        
        anomalies = []
        for doc in db.collection('detections').where(
            'timestamp', '>=', start_date.isoformat()
        ).where(
            'timestamp', '<', end_date.isoformat()
        ).stream():
            anomalies.append(doc.to_dict())
        
        # Prepare PDF data
        month_names = ['', 'January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December']
        
        stats = {
            'total':    len(anomalies),
            'fighting': sum(1 for a in anomalies if normalize_anomaly_type(a.get('anomaly_type', '')) == 'Fight'),
            'robbery':  sum(1 for a in anomalies if normalize_anomaly_type(a.get('anomaly_type', '')) == 'Robbery'),
            'accident': sum(1 for a in anomalies if normalize_anomaly_type(a.get('anomaly_type', '')) == 'Accident'),
        }

        return {
            "month": month_names[month],
            "year": year,
            "generated_at": datetime.now().isoformat(),
            "total_anomalies": stats['total'],
            "fighting": stats['fighting'],
            "robbery":  stats['robbery'],
            "accident": stats['accident'],
            "anomalies": [
                {
                    "timestamp": str(a.get('timestamp')),
                    "type": a.get('anomaly_type'),
                    "confidence": a.get('confidence'),
                    "camera_id": a.get('camera_id'),
                }
                for a in anomalies[:100]  # Limit to 100 items for PDF
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
