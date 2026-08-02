from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from decimal import Decimal

from app.db import get_db
from app.models.models import Holding, Instrument, Tag, User, holding_tags
from app.schemas.holding import HoldingResponse, HoldingUpdateRequest
from app.auth.dependencies import get_current_user, require_portfolio_access
from app.services.cgt import validate_holding_stream

router = APIRouter(prefix="/api", tags=["holdings"])

def build_holding_response(db: Session, holding: Holding) -> HoldingResponse:
    inst = db.query(Instrument).filter(Instrument.id == holding.instrument_id).first()
    symbol = inst.symbol if inst else ""
    name = inst.name if inst else ""
    last_price_str = inst.last_price if (inst and inst.last_price) else "0.00"

    tag_ids = [t.id for t in holding.tags]

    open_parcels, _, _ = validate_holding_stream(db, holding.id)
    total_qty = sum((p.qty_remaining for p in open_parcels), Decimal("0"))
    total_cost_base = sum((p.cost_base_remaining for p in open_parcels), Decimal("0"))
    cost_per_share = (total_cost_base / total_qty) if total_qty > Decimal("0") else Decimal("0")

    from app.models.models import Trade
    buy_trades = db.query(Trade).filter(Trade.holding_id == holding.id, Trade.type == "BUY").all()
    buy_qty = sum((Decimal(str(t.quantity)) for t in buy_trades), Decimal("0"))
    buy_cost = sum((Decimal(str(t.quantity)) * Decimal(str(t.unit_price)) for t in buy_trades), Decimal("0"))
    avg_buy_price = (buy_cost / buy_qty) if buy_qty > Decimal("0") else Decimal("0")

    last_p = Decimal(last_price_str) if last_price_str else Decimal("0")
    market_val = total_qty * last_p

    return HoldingResponse(
        id=holding.id,
        portfolio_id=holding.portfolio_id,
        instrument_id=holding.instrument_id,
        symbol=symbol,
        name=name,
        drp_enabled=holding.drp_enabled,
        notes=holding.notes or "",
        tag_ids=tag_ids,
        created_at=holding.created_at,
        quantity=f"{total_qty:.4f}",
        cost_base=f"{total_cost_base:.4f}",
        cost_base_per_share=f"{cost_per_share:.4f}",
        average_buy_price=f"{avg_buy_price:.4f}",
        last_price=last_price_str,
        market_value=f"{market_val:.4f}"
    )

@router.get("/portfolios/{id}/holdings", response_model=List[HoldingResponse])
def list_holdings(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    require_portfolio_access(id, "view", current_user, db)
    holdings = db.query(Holding).filter(Holding.portfolio_id == id).all()
    return [build_holding_response(db, h) for h in holdings]

@router.get("/holdings/{hid}", response_model=HoldingResponse)
def get_holding(
    hid: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    holding = db.query(Holding).filter(Holding.id == hid).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    require_portfolio_access(holding.portfolio_id, "view", current_user, db)
    return build_holding_response(db, holding)

@router.patch("/holdings/{hid}", response_model=HoldingResponse)
def update_holding(
    hid: int,
    req: HoldingUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    holding = db.query(Holding).filter(Holding.id == hid).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    require_portfolio_access(holding.portfolio_id, "edit", current_user, db)

    if req.drp_enabled is not None:
        holding.drp_enabled = req.drp_enabled
    if req.notes is not None:
        holding.notes = req.notes

    if req.tag_ids is not None:
        tags = db.query(Tag).filter(Tag.id.in_(req.tag_ids), Tag.portfolio_id == holding.portfolio_id).all()
        holding.tags = tags

    db.commit()
    db.refresh(holding)
    return build_holding_response(db, holding)

@router.delete("/holdings/{hid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holding(
    hid: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    holding = db.query(Holding).filter(Holding.id == hid).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")
    require_portfolio_access(holding.portfolio_id, "edit", current_user, db)
    db.delete(holding)
    db.commit()
