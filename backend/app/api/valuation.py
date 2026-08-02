import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db import get_db
from app.models.models import Holding, Trade, User
from app.auth.dependencies import get_current_user, require_portfolio_access
from app.services.valuation import get_date_range, compute_portfolio_valuation

router = APIRouter(prefix="/api/portfolios", tags=["valuation"])

@router.get("/{id}/valuation")
def get_portfolio_valuation(
    id: int,
    preset: Optional[str] = None,
    from_date: Optional[datetime.date] = None,
    to_date: Optional[datetime.date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_portfolio_access(id, "view", current_user, db)

    # Find earliest trade date across holdings
    earliest_trade = db.query(func.min(Trade.trade_date)).join(
        Holding, Trade.holding_id == Holding.id
    ).filter(Holding.portfolio_id == id).scalar()

    t0, t1 = get_date_range(preset, from_date, to_date, earliest_trade)
    series, metrics = compute_portfolio_valuation(db, id, t0, t1)

    return {
        "start_date": t0.isoformat(),
        "end_date": t1.isoformat(),
        "series": series,
        "metrics": metrics
    }
