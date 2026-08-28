from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models.models import User
from app.schemas.auth import UserRegisterRequest, UserLoginRequest, UserResponse
from app.auth.passwords import hash_password, verify_password
from app.auth.sessions import create_session, delete_session, SESSION_COOKIE_NAME
from app.auth.dependencies import get_current_user, get_token_from_request

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(req: UserRegisterRequest, db: Session = Depends(get_db)):
    if not settings.REGISTRATION_OPEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is currently closed"
        )
    
    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    pwd_hash = hash_password(req.password)
    user = User(username=req.username, password_hash=pwd_hash)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/login", response_model=UserResponse)
def login(req: UserLoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )
    
    session_obj, token = create_session(db, user)
    
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        path="/",
        secure=settings.COOKIE_SECURE,
        max_age=30 * 24 * 3600
    )
    return user

@router.post("/logout")
def logout(request: Request, response: Response, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    token = get_token_from_request(request)
    if token:
        delete_session(db, token)
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return {"detail": "Logged out successfully"}

@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/users", response_model=list[UserResponse])
def list_other_users(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return accounts that can be selected when sharing a portfolio."""
    return (
        db.query(User)
        .filter(User.id != current_user.id)
        .order_by(User.username.asc())
        .all()
    )
