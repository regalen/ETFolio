import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from decimal import Decimal

from app.db import get_db
from app.models.models import Distribution, Trade, Holding, Instrument, User
from app.schemas.distribution import (
    DistributionCreateRequest,
    DistributionUpdateRequest,
    DistributionResponse,
)
from app.auth.dependencies import get_current_user, require_portfolio_access
from app.services.cgt import validate_holding_stream, OversellError

router = APIRouter(prefix="/api", tags=["distributions"])

def get_units_held_on_date(db: Session, holding_id: int, on_date: datetime.date) -> Decimal:
    trades = db.query(Trade).filter(
        Trade.holding_id == holding_id,
        Trade.trade_date <= on_date
    ).all()
    units = Decimal("0")
    for t in trades:
        qty = Decimal(str(t.quantity))
        if t.type == "BUY":
            units += qty
        elif t.type == "SELL":
            units -= qty
    return max(Decimal("0"), units)

def dist_to_response(dist: Distribution) -> DistributionResponse:
    reinvested_id = dist.reinvested_trade.id if dist.reinvested_trade else None
    return DistributionResponse(
        id=dist.id,
        holding_id=dist.holding_id,
        pay_date=dist.pay_date,
        ex_date=dist.ex_date,
        amount_per_share=dist.amount_per_share,
        gross_amount=dist.gross_amount,
        franking_credits=dist.franking_credits,
        amit_cost_base_increase=dist.amit_cost_base_increase,
        amit_cost_base_decrease=dist.amit_cost_base_decrease,
        net_payment=dist.net_payment,
        notes=dist.notes,
        reinvested_trade_id=reinvested_id,
        created_at=dist.created_at,
        updated_at=dist.updated_at
    )

@router.post("/holdings/{hid}/distributions", response_model=DistributionResponse, status_code=status.HTTP_201_CREATED)
def create_distribution(
    hid: int,
    req: DistributionCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    holding = db.query(Holding).filter(Holding.id == hid).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    require_portfolio_access(holding.portfolio_id, "edit", current_user, db)

    target_date = req.ex_date or req.pay_date
    units_held = get_units_held_on_date(db, hid, target_date)

    if req.gross_amount is not None:
        gross_d = Decimal(req.gross_amount)
        if req.amount_per_share is not None:
            aps_d = Decimal(req.amount_per_share)
        else:
            aps_d = gross_d / units_held if units_held > Decimal("0") else gross_d
    elif req.amount_per_share is not None:
        aps_d = Decimal(req.amount_per_share)
        gross_d = aps_d * units_held if units_held > Decimal("0") else aps_d
    else:
        raise HTTPException(status_code=400, detail="Must provide either amount_per_share or gross_amount")

    reinvested_amt = Decimal("0")
    if req.reinvestment:
        r_units = Decimal(req.reinvestment.units)
        r_price = Decimal(req.reinvestment.price)
        reinvested_amt = r_units * r_price

    if req.net_payment is not None:
        net_d = Decimal(req.net_payment)
    else:
        net_d = max(Decimal("0"), gross_d - reinvested_amt)

    dist = Distribution(
        holding_id=hid,
        pay_date=req.pay_date,
        ex_date=req.ex_date,
        amount_per_share=f"{aps_d:.6f}" if aps_d is not None else None,
        gross_amount=f"{gross_d:.4f}",
        franking_credits=str(Decimal(req.franking_credits or "0")),
        amit_cost_base_increase=str(Decimal(req.amit_cost_base_increase or "0")),
        amit_cost_base_decrease=str(Decimal(req.amit_cost_base_decrease or "0")),
        net_payment=f"{net_d:.4f}",
        notes=req.notes or ""
    )
    db.add(dist)
    db.flush()

    if req.reinvestment:
        trade = Trade(
            holding_id=hid,
            type="BUY",
            trade_date=req.pay_date,
            quantity=req.reinvestment.units,
            unit_price=req.reinvestment.price,
            brokerage="0",
            notes="DRP Reinvestment",
            source_distribution_id=dist.id
        )
        db.add(trade)
        db.flush()

    try:
        validate_holding_stream(db, hid)
    except OversellError as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Oversell on {e.date}: attempt to sell {e.sell_qty} units with only {e.available_qty} units available"
        )

    db.commit()
    db.refresh(dist)
    return dist_to_response(dist)

@router.get("/holdings/{hid}/distributions", response_model=List[DistributionResponse])
def list_distributions(
    hid: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    holding = db.query(Holding).filter(Holding.id == hid).first()
    if not holding:
        raise HTTPException(status_code=404, detail="Holding not found")

    require_portfolio_access(holding.portfolio_id, "view", current_user, db)
    dists = db.query(Distribution).filter(Distribution.holding_id == hid).order_by(Distribution.pay_date.desc(), Distribution.id.desc()).all()
    return [dist_to_response(d) for d in dists]

@router.patch("/distributions/{did}", response_model=DistributionResponse)
def update_distribution(
    did: int,
    req: DistributionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dist = db.query(Distribution).filter(Distribution.id == did).first()
    if not dist:
        raise HTTPException(status_code=404, detail="Distribution not found")

    holding = db.query(Holding).filter(Holding.id == dist.holding_id).first()
    require_portfolio_access(holding.portfolio_id, "edit", current_user, db)

    if req.pay_date is not None:
        dist.pay_date = req.pay_date

    # Support clearing ex_date
    if "ex_date" in req.model_fields_set:
        dist.ex_date = req.ex_date

    target_date = dist.ex_date or dist.pay_date
    units_held = get_units_held_on_date(db, holding.id, target_date)

    if req.gross_amount is not None:
        gross_d = Decimal(req.gross_amount)
        dist.gross_amount = f"{gross_d:.4f}"
        if req.amount_per_share is not None:
            aps_d = Decimal(req.amount_per_share)
            dist.amount_per_share = f"{aps_d:.6f}"
        else:
            aps_d = gross_d / units_held if units_held > Decimal("0") else gross_d
            dist.amount_per_share = f"{aps_d:.6f}"
    elif req.amount_per_share is not None:
        aps_d = Decimal(req.amount_per_share)
        dist.amount_per_share = f"{aps_d:.6f}"
        gross_d = aps_d * units_held if units_held > Decimal("0") else aps_d
        dist.gross_amount = f"{gross_d:.4f}"

    if req.franking_credits is not None:
        dist.franking_credits = str(Decimal(req.franking_credits))
    if req.amit_cost_base_increase is not None:
        dist.amit_cost_base_increase = str(Decimal(req.amit_cost_base_increase))
    if req.amit_cost_base_decrease is not None:
        dist.amit_cost_base_decrease = str(Decimal(req.amit_cost_base_decrease))
    if req.net_payment is not None:
        dist.net_payment = str(Decimal(req.net_payment))
    if req.notes is not None:
        dist.notes = req.notes

    if "reinvestment" in req.model_fields_set:
        r_trade = db.query(Trade).filter(Trade.source_distribution_id == dist.id).first()
        if req.reinvestment is None:
            if r_trade:
                db.delete(r_trade)
        else:
            if r_trade:
                r_trade.quantity = req.reinvestment.units
                r_trade.unit_price = req.reinvestment.price
                r_trade.trade_date = dist.pay_date
            else:
                r_trade = Trade(
                    holding_id=holding.id,
                    type="BUY",
                    trade_date=dist.pay_date,
                    quantity=req.reinvestment.units,
                    unit_price=req.reinvestment.price,
                    brokerage="0",
                    notes="DRP Reinvestment",
                    source_distribution_id=dist.id
                )
                db.add(r_trade)

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
    db.refresh(dist)
    return dist_to_response(dist)

@router.delete("/distributions/{did}", status_code=status.HTTP_204_NO_CONTENT)
def delete_distribution(
    did: int,
    cascade: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    dist = db.query(Distribution).filter(Distribution.id == did).first()
    if not dist:
        raise HTTPException(status_code=404, detail="Distribution not found")

    holding = db.query(Holding).filter(Holding.id == dist.holding_id).first()
    require_portfolio_access(holding.portfolio_id, "edit", current_user, db)

    r_trade = db.query(Trade).filter(Trade.source_distribution_id == dist.id).first()
    if r_trade:
        if not cascade:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Distribution has a linked DRP BUY trade. Pass ?cascade=true to delete both."
            )
        db.delete(r_trade)

    db.delete(dist)
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
