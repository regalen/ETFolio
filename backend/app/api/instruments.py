import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.models import Instrument, PriceHistory, User
from app.schemas.holding import InstrumentResponse
from app.auth.dependencies import get_current_user
from app.services.pricing import symbol_search

router = APIRouter(prefix="/api/instruments", tags=["instruments"])

@router.get("/search")
async def search_instruments(q: str, current_user: User = Depends(get_current_user)):
    return await symbol_search(q)

@router.get("/{id}/prices")
def get_instrument_prices(
    id: int,
    from_date: Optional[datetime.date] = None,
    to_date: Optional[datetime.date] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inst = db.query(Instrument).filter(Instrument.id == id).first()
    if not inst:
        raise HTTPException(status_code=404, detail="Instrument not found")

    query = db.query(PriceHistory).filter(PriceHistory.instrument_id == id)
    if from_date:
        query = query.filter(PriceHistory.date >= from_date)
    if to_date:
        query = query.filter(PriceHistory.date <= to_date)

    prices = query.order_by(PriceHistory.date.asc()).all()
    return [{"date": p.date.isoformat(), "close": p.close} for p in prices]
