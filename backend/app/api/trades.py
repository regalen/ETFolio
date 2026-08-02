from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy import func
from sqlalchemy.orm import Session
import datetime

from app.db import get_db, get_session_factory
from app.models.models import Trade, Holding, Instrument, User, Distribution, PriceHistory
from app.schemas.trade import TradeCreateRequest, TradeUpdateRequest, TradeResponse
from app.auth.dependencies import get_current_user, require_portfolio_access
from app.services.pricing import ensure_instrument, backfill_prices
from app.services.cgt import validate_holding_stream, OversellError

router = APIRouter(prefix="/api", tags=["trades"])

def should_backfill(db: Session, instrument_id: int, trade_date: datetime.date) -> bool:
    earliest = db.query(func.min(PriceHistory.date)).filter(PriceHistory.instrument_id == instrument_id).scalar()
    return earliest is None or trade_date < earliest

def bg_backfill(instrument_id: int, since_date: datetime.date):
    SessionMaker = get_session_factory()
    db = SessionMaker()
    try:
        inst = db.query(Instrument).filter(Instrument.id == instrument_id).first()
        if inst:
            backfill_prices(db, inst, since_date)
    finally:
        db.close()

def trade_to_response(trade: Trade, symbol: str) -> TradeResponse:
    return TradeResponse(
        id=trade.id,
        holding_id=trade.holding_id,
        symbol=symbol,
        type=trade.type,
        trade_date=trade.trade_date,
        quantity=trade.quantity,
        unit_price=trade.unit_price,
        brokerage=trade.brokerage,
        broker=trade.broker,
        notes=trade.notes,
        sell_allocation_method=trade.sell_allocation_method,
        source_distribution_id=trade.source_distribution_id,
        import_batch_id=trade.import_batch_id,
        created_at=trade.created_at,
        updated_at=trade.updated_at
    )

@router.post("/portfolios/{id}/trades", response_model=TradeResponse, status_code=status.HTTP_201_CREATED)
def create_trade(
    id: int,
    req: TradeCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    portfolio, perm = require_portfolio_access(id, "edit", current_user, db)
    inst = ensure_instrument(db, req.symbol)

    holding = db.query(Holding).filter(
        Holding.portfolio_id == id,
        Holding.instrument_id == inst.id
    ).first()

    if not holding:
        holding = Holding(portfolio_id=id, instrument_id=inst.id)
        db.add(holding)
        db.flush()

    if req.type == "SELL" and not req.sell_allocation_method:
        req.sell_allocation_method = "min_cgt"

    trade = Trade(
        holding_id=holding.id,
        type=req.type,
        trade_date=req.trade_date,
        quantity=req.quantity,
        unit_price=req.unit_price,
        brokerage=req.brokerage,
        broker=req.broker,
        notes=req.notes,
        sell_allocation_method=req.sell_allocation_method if req.type == "SELL" else None
    )
    db.add(trade)
    db.flush()

    try:
        validate_holding_stream(db, holding.id)
    except OversellError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Oversell on {e.date}: attempt to sell {e.sell_qty} units with only {e.available_qty} units available"
        )

    # Check if backfill is required
    if should_backfill(db, inst.id, req.trade_date):
        background_tasks.add_task(bg_backfill, inst.id, req.trade_date)

    db.commit()
    db.refresh(trade)

    return trade_to_response(trade, inst.symbol)

@router.get("/holdings/{hid}/trades", response_model=List[TradeResponse])
def list_holding_trades(
    hid: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    holding = db.query(Holding).filter(Holding.id == hid).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    require_portfolio_access(holding.portfolio_id, "view", current_user, db)
    inst = db.query(Instrument).filter(Instrument.id == holding.instrument_id).first()
    symbol = inst.symbol if inst else ""

    trades = db.query(Trade).filter(Trade.holding_id == hid).order_by(Trade.trade_date.desc(), Trade.id.desc()).all()
    return [trade_to_response(t, symbol) for t in trades]

@router.patch("/trades/{tid}", response_model=TradeResponse)
def update_trade(
    tid: int,
    req: TradeUpdateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    trade = db.query(Trade).filter(Trade.id == tid).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    holding = db.query(Holding).filter(Holding.id == trade.holding_id).first()
    require_portfolio_access(holding.portfolio_id, "edit", current_user, db)
    inst = db.query(Instrument).filter(Instrument.id == holding.instrument_id).first()

    if req.trade_date is not None:
        trade.trade_date = req.trade_date
    if req.quantity is not None:
        trade.quantity = req.quantity
    if req.unit_price is not None:
        trade.unit_price = req.unit_price
    if req.brokerage is not None:
        trade.brokerage = req.brokerage
    if req.broker is not None:
        trade.broker = req.broker
    if req.notes is not None:
        trade.notes = req.notes
    if req.sell_allocation_method is not None and trade.type == "SELL":
        trade.sell_allocation_method = req.sell_allocation_method

    db.flush()

    try:
        validate_holding_stream(db, holding.id)
    except OversellError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Oversell on {e.date}: attempt to sell {e.sell_qty} units with only {e.available_qty} units available"
        )

    if inst and should_backfill(db, inst.id, trade.trade_date):
        background_tasks.add_task(bg_backfill, inst.id, trade.trade_date)

    db.commit()
    db.refresh(trade)

    return trade_to_response(trade, inst.symbol if inst else "")

@router.delete("/trades/{tid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trade(
    tid: int,
    cascade: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    trade = db.query(Trade).filter(Trade.id == tid).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")

    holding = db.query(Holding).filter(Holding.id == trade.holding_id).first()
    require_portfolio_access(holding.portfolio_id, "edit", current_user, db)

    if trade.source_distribution_id:
        if not cascade:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Trade is linked to a DRP distribution. Pass ?cascade=true to delete both."
            )
        dist = db.query(Distribution).filter(Distribution.id == trade.source_distribution_id).first()
        if dist:
            db.delete(dist)

    db.delete(trade)
    db.flush()

    try:
        validate_holding_stream(db, holding.id)
    except OversellError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Oversell on {e.date}: attempt to sell {e.sell_qty} units with only {e.available_qty} units available"
        )

    db.commit()
