import datetime
from decimal import Decimal
import pytest
from app.services.cgt import (
    EventInput,
    replay_cgt_events,
    OversellError,
    Parcel,
    RealisedEvent,
    E4Event,
    is_discount_eligible,
)

dt_now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)

def test_golden_1_single_buy_full_sell():
    # Buy 100 @ $10 + $10 brokerage = total cost base $1010
    # Sell 100 @ $15 - $10 brokerage = net proceeds $1490
    # Realised gain = $1490 - $1010 = $480
    b1 = EventInput(
        event_type="BUY", date=datetime.date(2025, 1, 1), created_at=dt_now, id=1,
        quantity=Decimal("100"), unit_price=Decimal("10.00"), brokerage=Decimal("10.00")
    )
    s1 = EventInput(
        event_type="SELL", date=datetime.date(2025, 6, 1), created_at=dt_now, id=2,
        quantity=Decimal("100"), unit_price=Decimal("15.00"), brokerage=Decimal("10.00"),
        sell_allocation_method="fifo"
    )
    open_parcels, realised, e4 = replay_cgt_events([b1, s1])
    assert len(open_parcels) == 0
    assert len(realised) == 1
    assert realised[0].gain == Decimal("480.00")
    assert realised[0].cost_base_share == Decimal("1010.00")
    assert realised[0].proceeds_share == Decimal("1490.00")
    assert not realised[0].discount_eligible

    # Loss case: Sell 100 @ $8 - $10 brokerage = net proceeds $790 -> Gain = $790 - $1010 = -$220
    s_loss = EventInput(
        event_type="SELL", date=datetime.date(2025, 6, 1), created_at=dt_now, id=3,
        quantity=Decimal("100"), unit_price=Decimal("8.00"), brokerage=Decimal("10.00"),
        sell_allocation_method="fifo"
    )
    _, realised_loss, _ = replay_cgt_events([b1, s_loss])
    assert len(realised_loss) == 1
    assert realised_loss[0].gain == Decimal("-220.00")


def test_golden_2_discount_boundary():
    acquire = datetime.date(2025, 1, 1)
    
    # 365 days later: 2026-01-01 -> strictly > 365 is False (365 is not > 365)
    sell_365 = datetime.date(2026, 1, 1)
    assert (sell_365 - acquire).days == 365
    assert not is_discount_eligible(acquire, sell_365)

    # 366 days later: 2026-01-02 -> strictly > 365 is True (366 > 365)
    sell_366 = datetime.date(2026, 1, 2)
    assert (sell_366 - acquire).days == 366
    assert is_discount_eligible(acquire, sell_366)

    b1 = EventInput(
        event_type="BUY", date=acquire, created_at=dt_now, id=1,
        quantity=Decimal("10"), unit_price=Decimal("10"), brokerage=Decimal("0")
    )
    s_365 = EventInput(
        event_type="SELL", date=sell_365, created_at=dt_now, id=2,
        quantity=Decimal("10"), unit_price=Decimal("20"), brokerage=Decimal("0")
    )
    _, res_365, _ = replay_cgt_events([b1, s_365])
    assert not res_365[0].discount_eligible

    s_366 = EventInput(
        event_type="SELL", date=sell_366, created_at=dt_now, id=3,
        quantity=Decimal("10"), unit_price=Decimal("20"), brokerage=Decimal("0")
    )
    _, res_366, _ = replay_cgt_events([b1, s_366])
    assert res_366[0].discount_eligible


def test_golden_3_fifo_lifo_min_cgt():
    # Buy Parcel 1: 2024-01-01, 10 units @ $10 (held > 12m at sell date 2025-06-01) -> cost base $100
    # Buy Parcel 2: 2025-01-01, 10 units @ $12 (held < 12m at sell date) -> cost base $120
    # Buy Parcel 3: 2025-02-01, 10 units @ $18 (held < 12m, loss if sold @ $15) -> cost base $180
    b1 = EventInput("BUY", datetime.date(2024, 1, 1), dt_now, 1, quantity=Decimal("10"), unit_price=Decimal("10"), brokerage=Decimal("0"))
    b2 = EventInput("BUY", datetime.date(2025, 1, 1), dt_now, 2, quantity=Decimal("10"), unit_price=Decimal("12"), brokerage=Decimal("0"))
    b3 = EventInput("BUY", datetime.date(2025, 2, 1), dt_now, 3, quantity=Decimal("10"), unit_price=Decimal("18"), brokerage=Decimal("0"))
    
    sell_date = datetime.date(2025, 6, 1) # Sale price $15, qty 10
    # At $15:
    # Parcel 1: raw gain $5/unit. Held > 12m -> taxable gain $2.50/unit
    # Parcel 2: raw gain $3/unit. Held < 12m -> taxable gain $3.00/unit
    # Parcel 3: raw loss -$3/unit. Held < 12m -> taxable -$3.00/unit

    # FIFO should pick Parcel 1 (oldest)
    s_fifo = EventInput("SELL", sell_date, dt_now, 4, quantity=Decimal("10"), unit_price=Decimal("15"), brokerage=Decimal("0"), sell_allocation_method="fifo")
    _, res_fifo, _ = replay_cgt_events([b1, b2, b3, s_fifo])
    assert res_fifo[0].parcel_id == 1

    # LIFO should pick Parcel 3 (newest)
    s_lifo = EventInput("SELL", sell_date, dt_now, 5, quantity=Decimal("10"), unit_price=Decimal("15"), brokerage=Decimal("0"), sell_allocation_method="lifo")
    _, res_lifo, _ = replay_cgt_events([b1, b2, b3, s_lifo])
    assert res_lifo[0].parcel_id == 3

    # MIN_CGT should pick Parcel 3 (biggest loss, taxable -$3), then Parcel 1 (discounted gain $2.50), then Parcel 2 ($3.00)
    s_min = EventInput("SELL", sell_date, dt_now, 6, quantity=Decimal("10"), unit_price=Decimal("15"), brokerage=Decimal("0"), sell_allocation_method="min_cgt")
    _, res_min, _ = replay_cgt_events([b1, b2, b3, s_min])
    assert res_min[0].parcel_id == 3

    # If selling 20 units with MIN_CGT: should consume Parcel 3 first, then Parcel 1!
    s_min20 = EventInput("SELL", sell_date, dt_now, 7, quantity=Decimal("20"), unit_price=Decimal("15"), brokerage=Decimal("0"), sell_allocation_method="min_cgt")
    _, res_min20, _ = replay_cgt_events([b1, b2, b3, s_min20])
    assert len(res_min20) == 2
    assert res_min20[0].parcel_id == 3
    assert res_min20[1].parcel_id == 1


def test_golden_4_partial_parcel_consumption():
    b1 = EventInput("BUY", datetime.date(2025, 1, 1), dt_now, 1, quantity=Decimal("100"), unit_price=Decimal("10"), brokerage=Decimal("10")) # Cost base 1010, $10.10/unit
    s1 = EventInput("SELL", datetime.date(2025, 3, 1), dt_now, 2, quantity=Decimal("40"), unit_price=Decimal("15"), brokerage=Decimal("5"), sell_allocation_method="fifo")
    
    open_parcels, realised, _ = replay_cgt_events([b1, s1])
    assert len(open_parcels) == 1
    assert open_parcels[0].qty_remaining == Decimal("60")
    assert open_parcels[0].cost_base_remaining == Decimal("606.00") # 60 * 10.10
    assert len(realised) == 1
    assert realised[0].qty == Decimal("40")
    assert realised[0].cost_base_share == Decimal("404.00")
    assert realised[0].proceeds_share == Decimal("595.00") # (40 * 15) - 5 = 595


def test_golden_5_amit_pro_rata_adjustment():
    b1 = EventInput("BUY", datetime.date(2025, 1, 1), dt_now, 1, quantity=Decimal("60"), unit_price=Decimal("10"), brokerage=Decimal("0")) # cost base 600
    b2 = EventInput("BUY", datetime.date(2025, 2, 1), dt_now, 2, quantity=Decimal("40"), unit_price=Decimal("10"), brokerage=Decimal("0")) # cost base 400
    
    # AMIT decrease $100 -> pro-rata: b1 gets 60% ($60), b2 gets 40% ($40)
    amit = EventInput("AMIT", datetime.date(2025, 3, 1), dt_now, 10, amit_increase=Decimal("0"), amit_decrease=Decimal("100"))
    
    open_parcels, _, e4 = replay_cgt_events([b1, b2, amit])
    assert len(e4) == 0
    p1 = next(p for p in open_parcels if p.parcel_id == 1)
    p2 = next(p for p in open_parcels if p.parcel_id == 2)
    assert p1.cost_base_remaining == Decimal("540.00")
    assert p2.cost_base_remaining == Decimal("360.00")

    # Sell 60 units of b1 (FIFO)
    s1 = EventInput("SELL", datetime.date(2025, 4, 1), dt_now, 3, quantity=Decimal("60"), unit_price=Decimal("12"), brokerage=Decimal("0"), sell_allocation_method="fifo")
    
    # Second AMIT increase $50 -> touches remaining open parcel b2 ONLY
    amit2 = EventInput("AMIT", datetime.date(2025, 5, 1), dt_now, 11, amit_increase=Decimal("50"), amit_decrease=Decimal("0"))
    
    open_parcels2, _, _ = replay_cgt_events([b1, b2, amit, s1, amit2])
    assert len(open_parcels2) == 1
    assert open_parcels2[0].parcel_id == 2
    assert open_parcels2[0].cost_base_remaining == Decimal("410.00") # 360 + 50


def test_golden_6_e4_capital_gain_event():
    # Buy parcel: cost base $50, 10 units @ $5
    b1 = EventInput("BUY", datetime.date(2024, 1, 1), dt_now, 1, quantity=Decimal("10"), unit_price=Decimal("5"), brokerage=Decimal("0"))
    # AMIT decrease $70 on 2025-06-01 (held > 12m) -> clamps cost base to 0, emits E4 gain of $20
    amit = EventInput("AMIT", datetime.date(2025, 6, 1), dt_now, 10, amit_increase=Decimal("0"), amit_decrease=Decimal("70"))
    
    open_parcels, _, e4 = replay_cgt_events([b1, amit])
    assert len(open_parcels) == 1
    assert open_parcels[0].cost_base_remaining == Decimal("0")
    assert len(e4) == 1
    assert e4[0].amount == Decimal("20")
    assert e4[0].discount_eligible # held 2024-01-01 to 2025-06-01 (> 365 days)


def test_golden_7_drp_parcel_creation():
    # Regular Buy
    b1 = EventInput("BUY", datetime.date(2025, 1, 1), dt_now, 1, quantity=Decimal("100"), unit_price=Decimal("10"), brokerage=Decimal("10"))
    # DRP Buy created from reinvested distribution: 5 units @ $11, brokerage = 0
    b_drp = EventInput("BUY", datetime.date(2025, 4, 1), dt_now, 2, quantity=Decimal("5"), unit_price=Decimal("11"), brokerage=Decimal("0"))
    
    open_parcels, _, _ = replay_cgt_events([b1, b_drp])
    assert len(open_parcels) == 2
    p_drp = next(p for p in open_parcels if p.parcel_id == 2)
    assert p_drp.qty_remaining == Decimal("5")
    assert p_drp.cost_base_remaining == Decimal("55.00")


def test_golden_8_same_day_ordering_and_oversell():
    # Same date 2025-01-01: AMIT decrease $10, BUY 10 units @ $10, SELL 10 units @ $12
    # Standard ordering priority: AMIT -> BUY -> SELL.
    dt_same = datetime.date(2025, 1, 1)
    b1 = EventInput("BUY", dt_same, dt_now, 1, quantity=Decimal("10"), unit_price=Decimal("10"), brokerage=Decimal("0"))
    s1 = EventInput("SELL", dt_same, dt_now, 2, quantity=Decimal("10"), unit_price=Decimal("12"), brokerage=Decimal("0"), sell_allocation_method="fifo")
    
    open_parcels, realised, _ = replay_cgt_events([b1, s1])
    assert len(open_parcels) == 0
    assert len(realised) == 1

    # Oversell test: sell 15 units when only 10 available
    s_over = EventInput("SELL", dt_same, dt_now, 3, quantity=Decimal("15"), unit_price=Decimal("12"), brokerage=Decimal("0"))
    with pytest.raises(OversellError) as exc_info:
        replay_cgt_events([b1, s_over])
    assert exc_info.value.sell_qty == Decimal("15")
    assert exc_info.value.available_qty == Decimal("10")


def test_golden_9_edit_invalidation_replay_error():
    """Golden Case 9: Shrinking an earlier BUY trade causes subsequent SELL to oversell."""
    dt1 = datetime.date(2025, 1, 1)
    dt2 = datetime.date(2025, 2, 1)

    # Initial stream: BUY 20 units, then SELL 15 units
    b_orig = EventInput("BUY", dt1, dt_now, 1, quantity=Decimal("20"), unit_price=Decimal("10.00"), brokerage=Decimal("0"))
    s1 = EventInput("SELL", dt2, dt_now, 2, quantity=Decimal("15"), unit_price=Decimal("15.00"), brokerage=Decimal("0"), sell_allocation_method="fifo")

    open_p, realised, _ = replay_cgt_events([b_orig, s1])
    assert len(open_p) == 1
    assert open_p[0].qty_remaining == Decimal("5")

    # User edits earlier BUY to shrink quantity from 20 -> 10 units
    b_edited = EventInput("BUY", dt1, dt_now, 1, quantity=Decimal("10"), unit_price=Decimal("10.00"), brokerage=Decimal("0"))

    # Invalidation replay MUST raise OversellError because SELL 15 > 10 available
    with pytest.raises(OversellError) as exc_info:
        replay_cgt_events([b_edited, s1])
    assert exc_info.value.sell_qty == Decimal("15")
    assert exc_info.value.available_qty == Decimal("10")
