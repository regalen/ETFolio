import datetime
from decimal import Decimal
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session

from app.models.models import Holding, Trade, Distribution, PriceHistory, Instrument
from app.services.cgt import build_events_for_holding, replay_cgt_events, EventInput

def get_date_range(
    preset: Optional[str],
    from_date: Optional[datetime.date],
    to_date: Optional[datetime.date],
    earliest_trade_date: Optional[datetime.date]
) -> Tuple[datetime.date, datetime.date]:
    today = datetime.date.today()

    if preset == "today":
        return today, today
    elif preset == "7d":
        return today - datetime.timedelta(days=6), today
    elif preset == "12m":
        return today - datetime.timedelta(days=365), today
    elif preset == "ytd":
        return datetime.date(today.year, 1, 1), today
    elif preset == "fy":
        if today.month >= 7:
            start_fy = datetime.date(today.year, 7, 1)
        else:
            start_fy = datetime.date(today.year - 1, 7, 1)
        return start_fy, today
    elif preset == "all":
        start = earliest_trade_date if earliest_trade_date else today
        return start, today
    elif from_date and to_date:
        return from_date, to_date
    else:
        return today - datetime.timedelta(days=365), today


def compute_holding_daily_series(
    db: Session,
    holding: Holding,
    start_date: datetime.date,
    end_date: datetime.date
) -> Tuple[Dict[datetime.date, Decimal], Dict[datetime.date, Decimal]]:
    """
    Returns (value_series, cost_base_series) mapped by date.
    Uses forward-filled price close and incremental CGT replay per date.
    """
    # 1. Fetch price history
    prices_raw = db.query(PriceHistory).filter(
        PriceHistory.instrument_id == holding.instrument_id
    ).order_by(PriceHistory.date.asc()).all()

    price_map: Dict[datetime.date, Decimal] = {p.date: Decimal(p.close) for p in prices_raw}

    # 2. Build events
    events = build_events_for_holding(db, holding.id)

    # Group events by date
    events_by_date: Dict[datetime.date, List[Any]] = {}
    for ev in events:
        events_by_date.setdefault(ev.date, []).append(ev)

    value_series: Dict[datetime.date, Decimal] = {}
    cost_base_series: Dict[datetime.date, Decimal] = {}

    curr_date = start_date
    last_close = Decimal("0")

    # Find initial price close on or before start_date if available
    prior_prices = [p for p in prices_raw if p.date <= start_date]
    if prior_prices:
        last_close = Decimal(prior_prices[-1].close)

    # Accumulate events up to current date
    events_so_far = [ev for ev in events if ev.date < start_date]
    open_parcels, _, _ = replay_cgt_events(events_so_far)
    current_cost_base = sum((p.cost_base_remaining for p in open_parcels), Decimal("0"))
    current_qty = sum((p.qty_remaining for p in open_parcels), Decimal("0"))

    while curr_date <= end_date:
        # Update price close (forward-fill)
        if curr_date in price_map:
            last_close = price_map[curr_date]

        # Check if new events occurred on curr_date
        if curr_date in events_by_date:
            events_so_far.extend(events_by_date[curr_date])
            open_parcels, _, _ = replay_cgt_events(events_so_far)
            current_cost_base = sum((p.cost_base_remaining for p in open_parcels), Decimal("0"))
            current_qty = sum((p.qty_remaining for p in open_parcels), Decimal("0"))

        val = current_qty * last_close
        value_series[curr_date] = val
        cost_base_series[curr_date] = current_cost_base

        curr_date += datetime.timedelta(days=1)

    return value_series, cost_base_series


def compute_holding_metrics(
    db: Session,
    holding: Holding,
    t0: datetime.date,
    t1: datetime.date
) -> Dict[str, Any]:
    value_series, cost_base_series = compute_holding_daily_series(db, holding, t0, t1)

    # Opening MV(t0) before any trades on t0
    trades_before_t0 = db.query(Trade).filter(
        Trade.holding_id == holding.id,
        Trade.trade_date < t0
    ).all()

    qty_t0_open = Decimal("0")
    for t in trades_before_t0:
        t_qty = Decimal(str(t.quantity))
        if t.type == "BUY":
            qty_t0_open += t_qty
        elif t.type == "SELL":
            qty_t0_open -= t_qty

    prices_raw = db.query(PriceHistory).filter(
        PriceHistory.instrument_id == holding.instrument_id,
        PriceHistory.date <= t0
    ).order_by(PriceHistory.date.asc()).all()

    price_t0_open = Decimal(prices_raw[-1].close) if prices_raw else Decimal("0")
    mv_t0 = qty_t0_open * price_t0_open
    mv_t1 = value_series.get(t1, Decimal("0"))

    # Net invested inside [t0, t1]
    trades_in_period = db.query(Trade).filter(
        Trade.holding_id == holding.id,
        Trade.trade_date >= t0,
        Trade.trade_date <= t1
    ).all()

    buy_cost = Decimal("0")
    sell_proceeds = Decimal("0")
    for t in trades_in_period:
        t_qty = Decimal(str(t.quantity))
        t_price = Decimal(str(t.unit_price))
        t_fee = Decimal(str(t.brokerage or "0"))
        if t.type == "BUY":
            buy_cost += (t_qty * t_price + t_fee)
        elif t.type == "SELL":
            sell_proceeds += (t_qty * t_price - t_fee)

    net_invested = buy_cost - sell_proceeds
    cap_gain_dlr = mv_t1 - mv_t0 - net_invested

    # Income in period
    dists_in_period = db.query(Distribution).filter(
        Distribution.holding_id == holding.id,
        Distribution.pay_date >= t0,
        Distribution.pay_date <= t1
    ).all()

    income_dlr = sum((Decimal(str(d.gross_amount)) for d in dists_in_period), Decimal("0"))
    franking_dlr = sum((Decimal(str(d.franking_credits or "0")) for d in dists_in_period), Decimal("0"))

    total_return_dlr = cap_gain_dlr + income_dlr

    # Time-weighted average capital invested
    days_count = (t1 - t0).days + 1
    total_cost_base_sum = sum(cost_base_series.values(), Decimal("0"))
    avg_capital_invested = total_cost_base_sum / Decimal(str(days_count)) if days_count > 0 else Decimal("0")

    if avg_capital_invested > Decimal("0"):
        simple_return = total_return_dlr / avg_capital_invested
    else:
        simple_return = Decimal("0")

    # Annualization check
    if days_count > 365 and simple_return > Decimal("-1"):
        ann_return = ((Decimal("1") + simple_return) ** (Decimal("365.25") / Decimal(str(days_count)))) - Decimal("1")
    else:
        ann_return = simple_return

    return {
        "holding_id": holding.id,
        "market_value_t0": f"{mv_t0:.4f}",
        "market_value_t1": f"{mv_t1:.4f}",
        "net_invested": f"{net_invested:.4f}",
        "capital_gain": f"{cap_gain_dlr:.4f}",
        "income": f"{income_dlr:.4f}",
        "franking_credits": f"{franking_dlr:.4f}",
        "total_return": f"{total_return_dlr:.4f}",
        "avg_capital_invested": f"{avg_capital_invested:.4f}",
        "simple_return_pct": f"{(simple_return * Decimal('100')):.2f}",
        "ann_return_pct": f"{(ann_return * Decimal('100')):.2f}",
    }


def compute_portfolio_valuation(
    db: Session,
    portfolio_id: int,
    start_date: datetime.date,
    end_date: datetime.date
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    holdings = db.query(Holding).filter(Holding.portfolio_id == portfolio_id).all()

    daily_values: Dict[datetime.date, Decimal] = {}
    daily_cost_bases: Dict[datetime.date, Decimal] = {}

    curr = start_date
    while curr <= end_date:
        daily_values[curr] = Decimal("0")
        daily_cost_bases[curr] = Decimal("0")
        curr += datetime.timedelta(days=1)

    holding_metrics_list = []

    for h in holdings:
        v_ser, cb_ser = compute_holding_daily_series(db, h, start_date, end_date)
        for dt, val in v_ser.items():
            daily_values[dt] += val
        for dt, cb in cb_ser.items():
            daily_cost_bases[dt] += cb

        h_met = compute_holding_metrics(db, h, start_date, end_date)
        holding_metrics_list.append(h_met)

    series_output = []
    curr = start_date
    while curr <= end_date:
        series_output.append({
            "date": curr.isoformat(),
            "value": f"{daily_values[curr]:.4f}",
            "cost_base": f"{daily_cost_bases[curr]:.4f}"
        })
        curr += datetime.timedelta(days=1)

    # Portfolio aggregated metrics
    tot_mv_t0 = sum((Decimal(m["market_value_t0"]) for m in holding_metrics_list), Decimal("0"))
    tot_mv_t1 = sum((Decimal(m["market_value_t1"]) for m in holding_metrics_list), Decimal("0"))
    tot_net_invested = sum((Decimal(m["net_invested"]) for m in holding_metrics_list), Decimal("0"))
    tot_cap_gain = sum((Decimal(m["capital_gain"]) for m in holding_metrics_list), Decimal("0"))
    tot_income = sum((Decimal(m["income"]) for m in holding_metrics_list), Decimal("0"))
    tot_franking = sum((Decimal(m["franking_credits"]) for m in holding_metrics_list), Decimal("0"))
    tot_total_return = tot_cap_gain + tot_income

    days_count = (end_date - start_date).days + 1
    tot_cost_base_sum = sum(daily_cost_bases.values(), Decimal("0"))
    tot_avg_capital = tot_cost_base_sum / Decimal(str(days_count)) if days_count > 0 else Decimal("0")

    def calc_pct(amount: Decimal) -> Decimal:
        if tot_avg_capital <= Decimal("0"):
            return Decimal("0")
        simple = amount / tot_avg_capital
        if days_count > 365 and simple > Decimal("-1"):
            return ((Decimal("1") + simple) ** (Decimal("365.25") / Decimal(str(days_count)))) - Decimal("1")
        return simple

    cap_gain_pct = calc_pct(tot_cap_gain)
    inc_pct = calc_pct(tot_income)
    tot_ret_pct = calc_pct(tot_total_return)

    closing_cost_base = daily_cost_bases.get(end_date, Decimal("0"))

    portfolio_metrics = {
        "market_value_t0": f"{tot_mv_t0:.4f}",
        "market_value_t1": f"{tot_mv_t1:.4f}",
        "cost_base_t1": f"{closing_cost_base:.4f}",
        "net_invested": f"{tot_net_invested:.4f}",
        "capital_gain": f"{tot_cap_gain:.4f}",
        "capital_gain_pct": f"{(cap_gain_pct * Decimal('100')):.2f}",
        "income": f"{tot_income:.4f}",
        "income_pct": f"{(inc_pct * Decimal('100')):.2f}",
        "franking_credits": f"{tot_franking:.4f}",
        "total_return": f"{tot_total_return:.4f}",
        "total_return_pct": f"{(tot_ret_pct * Decimal('100')):.2f}",
        "avg_capital_invested": f"{tot_avg_capital:.4f}",
        "simple_return_pct": f"{(tot_ret_pct * Decimal('100')):.2f}",
        "ann_return_pct": f"{(tot_ret_pct * Decimal('100')):.2f}",
        "holdings": holding_metrics_list
    }

    return series_output, portfolio_metrics
