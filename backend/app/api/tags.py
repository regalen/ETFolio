from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.models import Tag, User
from app.schemas.holding import TagResponse
from app.auth.dependencies import get_current_user, require_portfolio_access

router = APIRouter(prefix="/api", tags=["tags"])

class TagCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)

class TagUpdateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)

@router.get("/portfolios/{id}/tags", response_model=List[TagResponse])
def list_tags(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_portfolio_access(id, "view", current_user, db)
    tags = db.query(Tag).filter(Tag.portfolio_id == id).all()
    return tags

@router.post("/portfolios/{id}/tags", response_model=TagResponse, status_code=status.HTTP_201_CREATED)
def create_tag(
    id: int,
    req: TagCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_portfolio_access(id, "edit", current_user, db)

    name_clean = req.name.strip()
    existing = db.query(Tag).filter(Tag.portfolio_id == id, Tag.name == name_clean).first()
    if existing:
        return existing

    tag = Tag(portfolio_id=id, name=name_clean)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag

@router.patch("/tags/{tid}", response_model=TagResponse)
def update_tag(
    tid: int,
    req: TagUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tag = db.query(Tag).filter(Tag.id == tid).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    require_portfolio_access(tag.portfolio_id, "edit", current_user, db)
    tag.name = req.name.strip()
    db.commit()
    db.refresh(tag)
    return tag

@router.delete("/tags/{tid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(
    tid: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tag = db.query(Tag).filter(Tag.id == tid).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    require_portfolio_access(tag.portfolio_id, "edit", current_user, db)
    db.delete(tag)
    db.commit()
