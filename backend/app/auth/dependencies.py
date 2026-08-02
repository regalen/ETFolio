import datetime
from typing import Optional, Callable
from fastapi import Request, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db import get_db
from app.auth.sessions import SESSION_COOKIE_NAME, hash_token
from app.models.models import User, Session as SessionModel, Portfolio, PortfolioShare

def get_token_from_request(request: Request) -> Optional[str]:
    # Check cookie first
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        # Check Authorization header: Bearer <token>
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
    return token

def get_current_user(
    request: Request,
    db: Session = Depends(get_db)
) -> User:
    token = get_token_from_request(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )
    
    token_h = hash_token(token)
    session_obj = db.query(SessionModel).filter(SessionModel.token_hash == token_h).first()
    
    if not session_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session token"
        )
    
    now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
    if session_obj.expires_at < now:
        db.delete(session_obj)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired"
        )
    
    # Update last_seen_at and sliding 30-day expires_at if > 5 mins stale
    if session_obj.last_seen_at is None or (now - session_obj.last_seen_at).total_seconds() > 300:
        session_obj.last_seen_at = now
        session_obj.expires_at = now + datetime.timedelta(days=30)
        db.commit()
    
    user = db.query(User).filter(User.id == session_obj.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    return user

def require_portfolio_access(portfolio_id: int, min_permission: str, user: User, db: Session) -> tuple[Portfolio, str]:
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio not found"
        )
    
    if portfolio.owner_id == user.id:
        return portfolio, "edit"
    
    share = db.query(PortfolioShare).filter(
        PortfolioShare.portfolio_id == portfolio_id,
        PortfolioShare.user_id == user.id
    ).first()
    
    if not share:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to portfolio denied"
        )
    
    if min_permission == "edit" and share.permission != "edit":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Edit permission required"
        )
    
    return portfolio, share.permission

def get_portfolio_view(portfolio_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> tuple[Portfolio, str]:
    return require_portfolio_access(portfolio_id, "view", user, db)

def get_portfolio_edit(portfolio_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> tuple[Portfolio, str]:
    return require_portfolio_access(portfolio_id, "edit", user, db)
