from datetime import datetime, timedelta
import hashlib
import jwt
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel

from config import ADMIN_PASSWORD, ADMIN_USERNAME, JWT_EXPIRE_HOURS, JWT_SECRET
from database.firebase_client import db
from database.models import UserRole

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    user_id: str
    name: str
    email: str
    role: str
    badge_id: str = None
    active: bool


class TokenData(BaseModel):
    token: str
    user_id: str
    username: str
    name: str
    role: str
    email: str


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def verify_password(stored_hash: str, password: str) -> bool:
    return stored_hash == hashlib.sha256(password.encode()).hexdigest()


def get_user_by_username(username: str):
    """Get user from Realtime Database by username (email)"""
    normalized_username = username.strip().lower()
    try:
        users = db.collection('users').where('email', '==', normalized_username).stream()
        for user in users:
            return user.to_dict()
    except Exception:
        pass

    # Fallback: fetch all users and filter in Python
    try:
        for user in db.collection('users').stream():
            data = user.to_dict()
            if data.get('email', '').strip().lower() == normalized_username:
                return data
    except Exception:
        pass

    return None


@router.post("/login", response_model=TokenData)
def login(req: LoginRequest):
    username = req.username.strip().lower()
    password = req.password.strip()

    # Try to authenticate - support both old admin and new users
    if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
        payload = {
            "sub": username,
            "user_id": "admin_root",
            "role": UserRole.ADMIN.value,
            "email": username,
            "name": "Administrator",
            "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
        return {
            "token": token,
            "username": username,
            "user_id": "admin_root",
            "name": "Administrator",
            "role": UserRole.ADMIN.value,
            "email": username,
        }
    
    # Check in Firestore
    user_data = get_user_by_username(username)
    if not user_data or not verify_password(user_data.get('password_hash', ''), password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not user_data.get('active', False):
        raise HTTPException(status_code=403, detail="User account is inactive")
    
    payload = {
        "sub": req.username,
        "user_id": user_data.get('user_id'),
        "role": user_data.get('role'),
        "email": user_data.get('email'),
        "name": user_data.get('name'),
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return {
        "token": token,
        "username": req.username,
        "user_id": user_data.get('user_id'),
        "name": user_data.get('name'),
        "role": user_data.get('role'),
        "email": user_data.get('email'),
    }


@router.get("/verify", response_model=dict)
def verify(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return {
            "valid": True,
            "username": payload.get("sub"),
            "user_id": payload.get("user_id"),
            "role": payload.get("role"),
            "name": payload.get("name"),
            "email": payload.get("email"),
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def get_current_user(authorization: str = Header(None)):
    """Dependency to get current user from Authorization header"""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    token = authorization.replace("Bearer ", "").strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_admin(current_user: dict = Depends(get_current_user)):
    """Dependency to require admin role"""
    if current_user.get("role") != UserRole.ADMIN.value:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
