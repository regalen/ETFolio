from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.models import User, Portfolio, PortfolioShare
from app.schemas.portfolio import (
    PortfolioCreateRequest,
    PortfolioUpdateRequest,
    PortfolioResponse,
    PortfolioShareCreateRequest,
    PortfolioShareResponse,
)
from app.auth.dependencies import (
    get_current_user,
    require_portfolio_access,
    get_portfolio_view,
    get_portfolio_edit,
)

router = APIRouter(prefix="/api/portfolios", tags=["portfolios"])

@router.get("", response_model=List[PortfolioResponse])
def list_portfolios(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Own portfolios
    owned = db.query(Portfolio).filter(Portfolio.owner_id == current_user.id).all()
    results = [
        PortfolioResponse(
            id=p.id,
            owner_id=p.owner_id,
            name=p.name,
            created_at=p.created_at,
            permission="owner"
        )
        for p in owned
    ]
    
    # Shared portfolios
    shares = db.query(PortfolioShare).filter(PortfolioShare.user_id == current_user.id).all()
    for s in shares:
        p = db.query(Portfolio).filter(Portfolio.id == s.portfolio_id).first()
        if p:
            results.append(
                PortfolioResponse(
                    id=p.id,
                    owner_id=p.owner_id,
                    name=p.name,
                    created_at=p.created_at,
                    permission=s.permission
                )
            )
    return results

@router.post("", response_model=PortfolioResponse, status_code=status.HTTP_201_CREATED)
def create_portfolio(
    req: PortfolioCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    portfolio = Portfolio(owner_id=current_user.id, name=req.name)
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)
    return PortfolioResponse(
        id=portfolio.id,
        owner_id=portfolio.owner_id,
        name=portfolio.name,
        created_at=portfolio.created_at,
        permission="owner"
    )

@router.get("/{id}", response_model=PortfolioResponse)
def get_portfolio(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    portfolio, perm = require_portfolio_access(id, "view", current_user, db)
    effective_perm = "owner" if portfolio.owner_id == current_user.id else perm
    return PortfolioResponse(
        id=portfolio.id,
        owner_id=portfolio.owner_id,
        name=portfolio.name,
        created_at=portfolio.created_at,
        permission=effective_perm
    )

@router.patch("/{id}", response_model=PortfolioResponse)
def update_portfolio(
    id: int,
    req: PortfolioUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    portfolio, perm = require_portfolio_access(id, "edit", current_user, db)
    portfolio.name = req.name
    db.commit()
    db.refresh(portfolio)
    effective_perm = "owner" if portfolio.owner_id == current_user.id else perm
    return PortfolioResponse(
        id=portfolio.id,
        owner_id=portfolio.owner_id,
        name=portfolio.name,
        created_at=portfolio.created_at,
        permission=effective_perm
    )

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_portfolio(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    portfolio, perm = require_portfolio_access(id, "edit", current_user, db)
    if portfolio.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only portfolio owner can delete portfolio"
        )
    db.delete(portfolio)
    db.commit()

@router.get("/{id}/shares", response_model=List[PortfolioShareResponse])
def list_portfolio_shares(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    portfolio, perm = require_portfolio_access(id, "view", current_user, db)
    shares = db.query(PortfolioShare).filter(PortfolioShare.portfolio_id == id).all()
    results = []
    for s in shares:
        u = db.query(User).filter(User.id == s.user_id).first()
        if u:
            results.append(
                PortfolioShareResponse(
                    id=s.id,
                    portfolio_id=s.portfolio_id,
                    user_id=s.user_id,
                    username=u.username,
                    permission=s.permission
                )
            )
    return results

@router.post("/{id}/shares", response_model=PortfolioShareResponse, status_code=status.HTTP_201_CREATED)
def add_portfolio_share(
    id: int,
    req: PortfolioShareCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    portfolio, perm = require_portfolio_access(id, "edit", current_user, db)
    target_user = db.query(User).filter(User.username == req.username).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{req.username}' not found"
        )
    if target_user.id == portfolio.owner_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot share portfolio with its owner"
        )
    
    existing = db.query(PortfolioShare).filter(
        PortfolioShare.portfolio_id == id,
        PortfolioShare.user_id == target_user.id
    ).first()
    
    if existing:
        existing.permission = req.permission
        db.commit()
        db.refresh(existing)
        return PortfolioShareResponse(
            id=existing.id,
            portfolio_id=existing.portfolio_id,
            user_id=existing.user_id,
            username=target_user.username,
            permission=existing.permission
        )
    
    share = PortfolioShare(
        portfolio_id=id,
        user_id=target_user.id,
        permission=req.permission
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return PortfolioShareResponse(
        id=share.id,
        portfolio_id=share.portfolio_id,
        user_id=share.user_id,
        username=target_user.username,
        permission=share.permission
    )

@router.delete("/{id}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_portfolio_share(
    id: int,
    share_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    portfolio, perm = require_portfolio_access(id, "edit", current_user, db)
    share = db.query(PortfolioShare).filter(
        PortfolioShare.id == share_id,
        PortfolioShare.portfolio_id == id
    ).first()
    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found"
        )
    db.delete(share)
    db.commit()
