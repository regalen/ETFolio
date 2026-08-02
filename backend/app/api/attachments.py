import os
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models.models import Attachment, User
from app.auth.dependencies import get_current_user, require_portfolio_access
from app.services.attachments import save_attachment, resolve_owner_portfolio_id

router = APIRouter(prefix="/api/attachments", tags=["attachments"])

@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    owner_type: str = Form(...),
    owner_id: int = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    att = save_attachment(db, current_user, owner_type, owner_id, file)
    return {
        "id": att.id,
        "owner_type": att.owner_type,
        "owner_id": att.owner_id,
        "filename_original": att.filename_original,
        "mime_type": att.mime_type,
        "size_bytes": att.size_bytes,
        "created_at": att.created_at.isoformat()
    }

@router.get("/owner/{owner_type}/{owner_id}")
def list_attachments_for_owner(
    owner_type: str,
    owner_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    portfolio_id = resolve_owner_portfolio_id(db, owner_type, owner_id)
    require_portfolio_access(portfolio_id, "view", current_user, db)

    atts = db.query(Attachment).filter(
        Attachment.owner_type == owner_type,
        Attachment.owner_id == owner_id
    ).order_by(Attachment.created_at.desc()).all()

    return [
        {
            "id": a.id,
            "owner_type": a.owner_type,
            "owner_id": a.owner_id,
            "filename_original": a.filename_original,
            "mime_type": a.mime_type,
            "size_bytes": a.size_bytes,
            "created_at": a.created_at.isoformat()
        }
        for a in atts
    ]

@router.get("/{aid}/download")
def download_attachment(
    aid: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    att = db.query(Attachment).filter(Attachment.id == aid).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")

    portfolio_id = resolve_owner_portfolio_id(db, att.owner_type, att.owner_id)
    require_portfolio_access(portfolio_id, "view", current_user, db)

    full_path = os.path.join(settings.ATTACHMENTS_DIR, att.stored_path)
    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File content not found on disk")

    return FileResponse(
        path=full_path,
        media_type=att.mime_type,
        filename=att.filename_original
    )

@router.delete("/{aid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    aid: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    att = db.query(Attachment).filter(Attachment.id == aid).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")

    portfolio_id = resolve_owner_portfolio_id(db, att.owner_type, att.owner_id)
    require_portfolio_access(portfolio_id, "edit", current_user, db)

    full_path = os.path.join(settings.ATTACHMENTS_DIR, att.stored_path)
    if os.path.isfile(full_path):
        try:
            os.remove(full_path)
        except Exception:
            pass

    db.delete(att)
    db.commit()
