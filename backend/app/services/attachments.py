import os
import uuid
from typing import Tuple, Optional
from fastapi import UploadFile, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import Attachment, Trade, Distribution, Holding, User, Portfolio
from app.auth.dependencies import require_portfolio_access

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/heic"
}

def resolve_owner_portfolio_id(db: Session, owner_type: str, owner_id: int) -> int:
    if owner_type == "trade":
        trade = db.query(Trade).filter(Trade.id == owner_id).first()
        if not trade:
            raise HTTPException(status_code=404, detail="Linked trade not found")
        holding = db.query(Holding).filter(Holding.id == trade.holding_id).first()
        return holding.portfolio_id
    elif owner_type == "distribution":
        dist = db.query(Distribution).filter(Distribution.id == owner_id).first()
        if not dist:
            raise HTTPException(status_code=404, detail="Linked distribution not found")
        holding = db.query(Holding).filter(Holding.id == dist.holding_id).first()
        return holding.portfolio_id
    elif owner_type == "holding":
        holding = db.query(Holding).filter(Holding.id == owner_id).first()
        if not holding:
            raise HTTPException(status_code=404, detail="Linked holding not found")
        return holding.portfolio_id
    else:
        raise HTTPException(status_code=400, detail="Invalid owner_type")


def save_attachment(
    db: Session,
    user: User,
    owner_type: str,
    owner_id: int,
    file: UploadFile
) -> Attachment:
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{file.content_type}' not allowed (must be PDF, PNG, JPEG, or HEIC)"
        )

    # Read content to check size
    content = file.file.read()
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum allowed size of {settings.MAX_UPLOAD_MB} MB"
        )

    portfolio_id = resolve_owner_portfolio_id(db, owner_type, owner_id)
    require_portfolio_access(portfolio_id, "edit", user, db)

    ext = os.path.splitext(file.filename or "")[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    os.makedirs(settings.ATTACHMENTS_DIR, exist_ok=True)
    full_path = os.path.join(settings.ATTACHMENTS_DIR, stored_name)

    with open(full_path, "wb") as f:
        f.write(content)

    attachment = Attachment(
        owner_type=owner_type,
        owner_id=owner_id,
        filename_original=file.filename or "file",
        stored_path=stored_name,
        mime_type=file.content_type,
        size_bytes=len(content),
        uploaded_by=user.id
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment
