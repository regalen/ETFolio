import datetime
from decimal import Decimal
from typing import List, Optional, Literal, Dict, Any
from dataclasses import dataclass

class OversellError(Exception):
    def __init__(self, date: datetime.date, sell_qty: Decimal, available_qty: Decimal, trade_id: Optional[int] = None):
        self.date = date
        self.sell_qty = sell_qty
        self.available_qty = available_qty
        self.trade_id = trade_id
        super().__init__(f"Oversell on {date}: attempt to sell {sell_qty} units with only {available_qty} units available")


@dataclass
class Parcel:
    parcel_id: int
    acquire_date: datetime.date
    qty_remaining: Decimal
    cost_base_remaining: Decimal


@dataclass
class RealisedEvent:
    sell_date: datetime.date
    acquire_date: datetime.date
    qty: Decimal
    proceeds_share: Decimal
    cost_base_share: Decimal
    gain: Decimal
    discount_eligible: bool
    trade_id: int
    parcel_id: int


@dataclass
class E4Event:
    date: datetime.date
    acquire_date: datetime.date
    amount: Decimal
    discount_eligible: bool
    parcel_id: int


@dataclass
class EventInput:
    event_type: Literal["AMIT", "BUY", "SELL"]
    date: datetime.date
    created_at: datetime.datetime
    id: int  # trade_id or distribution_id

    # For BUY / SELL
    quantity: Optional[Decimal] = None
    unit_price: Optional[Decimal] = None
    brokerage: Optional[Decimal] = None
    sell_allocation_method: Optional[Literal["fifo", "lifo", "min_cgt"]] = None

    # For AMIT
    amit_increase: Optional[Decimal] = None
    amit_decrease: Optional[Decimal] = None


def is_discount_eligible(acquire_date: datetime.date, sell_date: datetime.date) -> bool:
    """Strictly greater than 12 months (365 days)."""
    return (sell_date - acquire_date).days > 365


def replay_cgt_events(events: List[EventInput]) -> tuple[List[Parcel], List[RealisedEvent], List[E4Event]]:
    """
    Pure CGT replay engine. Replays events in deterministic order:
    1. Primary sort key: event date ascending
    2. Secondary sort key: event priority (AMIT = 1, BUY = 2, SELL = 3)
    3. Tertiary sort key: created_at ascending
    4. Quaternary sort key: id ascending
    """
    def priority(ev: EventInput) -> int:
        if ev.event_type == "AMIT":
            return 1
        elif ev.event_type == "BUY":
            return 2
        else:
            return 3

    sorted_events = sorted(
        events,
        key=lambda ev: (ev.date, priority(ev), ev.created_at, ev.id)
    )

    open_parcels: List[Parcel] = []
    realised_events: List[RealisedEvent] = []
    e4_events: List[E4Event] = []

    for ev in sorted_events:
        if ev.event_type == "BUY":
            qty = ev.quantity if ev.quantity is not None else Decimal("0")
            price = ev.unit_price if ev.unit_price is not None else Decimal("0")
            brokerage = ev.brokerage if ev.brokerage is not None else Decimal("0")
            
            cost_base = qty * price + brokerage
            open_parcels.append(Parcel(
                parcel_id=ev.id,
                acquire_date=ev.date,
                qty_remaining=qty,
                cost_base_remaining=cost_base
            ))

        elif ev.event_type == "AMIT":
            inc = ev.amit_increase if ev.amit_increase is not None else Decimal("0")
            dec = ev.amit_decrease if ev.amit_decrease is not None else Decimal("0")
            net = inc - dec

            # Filter active open parcels
            active_parcels = [p for p in open_parcels if p.qty_remaining > Decimal("0")]
            total_units = sum((p.qty_remaining for p in active_parcels), Decimal("0"))

            if total_units > Decimal("0"):
                for p in active_parcels:
                    portion = p.qty_remaining / total_units
                    p_inc = inc * portion
                    p_dec = dec * portion
                    p_net = p_inc - p_dec

                    if p_net >= Decimal("0"):
                        p.cost_base_remaining += p_net
                    else:
                        decrease_amt = -p_net
                        if decrease_amt <= p.cost_base_remaining:
                            p.cost_base_remaining -= decrease_amt
                        else:
                            excess = decrease_amt - p.cost_base_remaining
                            p.cost_base_remaining = Decimal("0")
                            disc = is_discount_eligible(p.acquire_date, ev.date)
                            e4_events.append(E4Event(
                                date=ev.date,
                                acquire_date=p.acquire_date,
                                amount=excess,
                                discount_eligible=disc,
                                parcel_id=p.parcel_id
                            ))

        elif ev.event_type == "SELL":
            sell_qty = ev.quantity if ev.quantity is not None else Decimal("0")
            unit_price = ev.unit_price if ev.unit_price is not None else Decimal("0")
            brokerage = ev.brokerage if ev.brokerage is not None else Decimal("0")
            method = ev.sell_allocation_method or "min_cgt"

            active_parcels = [p for p in open_parcels if p.qty_remaining > Decimal("0")]
            total_units = sum((p.qty_remaining for p in active_parcels), Decimal("0"))

            if sell_qty > total_units:
                raise OversellError(
                    date=ev.date,
                    sell_qty=sell_qty,
                    available_qty=total_units,
                    trade_id=ev.id
                )

            # Order parcels by allocation method
            if method == "fifo":
                ordered_parcels = sorted(active_parcels, key=lambda p: (p.acquire_date, p.parcel_id))
            elif method == "lifo":
                ordered_parcels = sorted(active_parcels, key=lambda p: (p.acquire_date, p.parcel_id), reverse=True)
            elif method == "min_cgt":
                def taxable_score(p: Parcel):
                    cost_per_unit = p.cost_base_remaining / p.qty_remaining
                    raw_gain_per_unit = unit_price - cost_per_unit
                    disc = is_discount_eligible(p.acquire_date, ev.date)
                    if raw_gain_per_unit > Decimal("0") and disc:
                        taxable = raw_gain_per_unit * Decimal("0.5")
                    else:
                        taxable = raw_gain_per_unit
                    return (taxable, p.acquire_date, p.parcel_id)

                ordered_parcels = sorted(active_parcels, key=taxable_score)
            else:
                ordered_parcels = sorted(active_parcels, key=lambda p: (p.acquire_date, p.parcel_id))

            remaining_to_sell = sell_qty
            gross_proceeds = sell_qty * unit_price
            net_proceeds = gross_proceeds - brokerage

            for p in ordered_parcels:
                if remaining_to_sell <= Decimal("0"):
                    break

                qty_consumed = min(remaining_to_sell, p.qty_remaining)
                portion = qty_consumed / sell_qty
                proceeds_share = net_proceeds * portion

                if qty_consumed == p.qty_remaining:
                    cost_base_share = p.cost_base_remaining
                    p.cost_base_remaining = Decimal("0")
                    p.qty_remaining = Decimal("0")
                else:
                    cost_per_unit = p.cost_base_remaining / p.qty_remaining
                    cost_base_share = cost_per_unit * qty_consumed
                    p.cost_base_remaining -= cost_base_share
                    p.qty_remaining -= qty_consumed

                remaining_to_sell -= qty_consumed
                gain = proceeds_share - cost_base_share
                disc = is_discount_eligible(p.acquire_date, ev.date)

                realised_events.append(RealisedEvent(
                    sell_date=ev.date,
                    acquire_date=p.acquire_date,
                    qty=qty_consumed,
                    proceeds_share=proceeds_share,
                    cost_base_share=cost_base_share,
                    gain=gain,
                    discount_eligible=disc,
                    trade_id=ev.id,
                    parcel_id=p.parcel_id
                ))

            # Remove fully depleted parcels from open_parcels
            open_parcels = [p for p in open_parcels if p.qty_remaining > Decimal("0")]

    return open_parcels, realised_events, e4_events


def build_events_for_holding(db: Any, holding_id: int) -> List[EventInput]:
    from app.models.models import Trade, Distribution
    events: List[EventInput] = []

    trades = db.query(Trade).filter(Trade.holding_id == holding_id).all()
    for t in trades:
        events.append(EventInput(
            event_type=t.type,
            date=t.trade_date,
            created_at=t.created_at,
            id=t.id,
            quantity=Decimal(str(t.quantity)),
            unit_price=Decimal(str(t.unit_price)),
            brokerage=Decimal(str(t.brokerage or "0")),
            sell_allocation_method=t.sell_allocation_method
        ))

    dists = db.query(Distribution).filter(Distribution.holding_id == holding_id).all()
    for d in dists:
        inc = Decimal(str(d.amit_cost_base_increase or "0"))
        dec = Decimal(str(d.amit_cost_base_decrease or "0"))
        if inc > Decimal("0") or dec > Decimal("0"):
            events.append(EventInput(
                event_type="AMIT",
                date=d.pay_date,
                created_at=d.created_at,
                id=d.id,
                amit_increase=inc,
                amit_decrease=dec
            ))

    return events


def validate_holding_stream(db: Any, holding_id: int) -> tuple[List[Parcel], List[RealisedEvent], List[E4Event]]:
    events = build_events_for_holding(db, holding_id)
    return replay_cgt_events(events)

