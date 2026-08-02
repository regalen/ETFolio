import hmac
import hashlib
import secrets
import datetime
from sqlalchemy.orm import Session
from app.config import settings
from app.models.models import Session as SessionModel, User

SESSION_COOKIE_NAME = "session_token"
SESSION_DURATION_DAYS = 30

def generate_token() -> str:
    return secrets.token_hex(32)

def hash_token(token: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()

def create_session(db: Session, user: User) -> tuple[SessionModel, str]:
    token = generate_token()
    token_h = hash_token(token)
    now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
    expires_at = now + datetime.timedelta(days=SESSION_DURATION_DAYS)
    
    session_obj = SessionModel(
        token_hash=token_h,
        user_id=user.id,
        created_at=now,
        expires_at=expires_at,
        last_seen_at=now,
    )
    db.add(session_obj)
    db.commit()
    db.refresh(session_obj)
    return session_obj, token

def delete_session(db: Session, token: str) -> None:
    token_h = hash_token(token)
    db.query(SessionModel).filter(SessionModel.token_hash == token_h).delete()
    db.commit()
