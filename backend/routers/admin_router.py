from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Body, Depends
from pydantic import BaseModel
from typing import List, Optional
import uuid
import hashlib

from database.firebase_client import db
from database.models import UserRole
from routers.auth_router import require_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


class UserRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str = UserRole.SECURITY_PERSONNEL.value
    badge_id: Optional[str] = None


class UserUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    badge_id: Optional[str] = None
    active: Optional[bool] = None


class UserListResponse(BaseModel):
    user_id: str
    name: str
    email: str
    role: str
    badge_id: Optional[str]
    active: bool
    created_at: str


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


@router.get("/users", response_model=List[UserListResponse])
def get_all_users(current_user: dict = Depends(require_admin), skip: int = Query(0), limit: int = Query(10)):
    """Get all users - Admin only"""
    try:
        users = []
        query = db.collection('users').offset(skip).limit(limit)
        for doc in query.stream():
            user_data = doc.to_dict()
            users.append(UserListResponse(
                user_id=user_data.get('user_id'),
                name=user_data.get('name'),
                email=user_data.get('email'),
                role=user_data.get('role'),
                badge_id=user_data.get('badge_id'),
                active=user_data.get('active', True),
                created_at=str(user_data.get('created_at', datetime.now())),
            ))
        return users
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/users")
def add_user(user: UserRequest, current_user: dict = Depends(require_admin)):
    """Add new user - Admin only"""
    if user.role != UserRole.SECURITY_PERSONNEL.value:
        raise HTTPException(status_code=400, detail="Only security personnel accounts may be created")

    try:
        normalized_email = user.email.strip().lower()
        # Check if user already exists
        existing = db.collection('users').where('email', '==', normalized_email).stream()
        if list(existing):
            raise HTTPException(status_code=400, detail="User already exists")

        # Prevent more than one security personnel account
        security_users = db.collection('users').where('role', '==', UserRole.SECURITY_PERSONNEL.value).stream()
        if any(security_users):
            raise HTTPException(status_code=400, detail="Only one security personnel account is allowed")
        
        user_id = str(uuid.uuid4())
        user_data = {
            'user_id': user_id,
            'name': user.name,
            'email': normalized_email,
            'password_hash': hash_password(user.password),
            'role': user.role,
            'badge_id': user.badge_id,
            'active': True,
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat(),
        }
        
        db.collection('users').document(user_id).set(user_data)
        return {"message": "User created successfully", "user_id": user_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/users/{user_id}")
def update_user(user_id: str, user_update: UserUpdateRequest, current_user: dict = Depends(require_admin)):
    """Update user - Admin only"""
    try:
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail="User not found")
        
        update_data = {}
        if user_update.name:
            update_data['name'] = user_update.name
        if user_update.email:
            update_data['email'] = user_update.email
        if user_update.role:
            update_data['role'] = user_update.role
        if user_update.badge_id is not None:
            update_data['badge_id'] = user_update.badge_id
        if user_update.active is not None:
            update_data['active'] = user_update.active
        
        update_data['updated_at'] = datetime.now().isoformat()
        user_ref.update(update_data)
        
        return {"message": "User updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/users/{user_id}")
def delete_user(user_id: str, current_user: dict = Depends(require_admin)):
    """Delete user - Admin only"""
    try:
        db.collection('users').document(user_id).delete()
        return {"message": "User deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/users/{user_id}/role")
def update_user_role(user_id: str, role: str = Body(...), current_user: dict = Depends(require_admin)):
    """Update user role - Admin only"""
    if role not in [UserRole.ADMIN.value, UserRole.SECURITY_PERSONNEL.value]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    try:
        db.collection('users').document(user_id).update({'role': role, 'updated_at': datetime.now().isoformat()})
        return {"message": "Role updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/users/{user_id}/badge")
def assign_badge(user_id: str, badge_id: str = Body(...), current_user: dict = Depends(require_admin)):
    """Assign badge to user - Admin only"""
    try:
        db.collection('users').document(user_id).update({'badge_id': badge_id, 'updated_at': datetime.now().isoformat()})
        return {"message": "Badge assigned successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
