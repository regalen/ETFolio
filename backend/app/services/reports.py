import csv
import io
import datetime
from decimal import Decimal
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session

from app.models.models import Holding, Instrument, Distribution, Trade
from app.services.cgt import build_events_for_holding, replay_cgt_events, RealisedEvent, E4Event

def get_fy_date_range(fy: int) -> Tuple[datetime.date, datetime.date]:
    """FY 2026 means 1 Jul 2025 to 30 Jun 2026."""
    start_date = datetime.date(fy - 1, 7, 1)
    end_date = datetime.date(fy, 6, 30)
    return start_date, end_date


def generate_cgt_report(db: Session, portfolio_id: int, fy: int) -> Dict[str, Any]:
    start_date, end_date = get_fy_date_range(fy)
    holdings = db.query(Holding).filter(Holding.portfolio_id == portfolio_id).all()

    discounted_gains: List[Dict[str, Any]] = []
    non_discounted_gains: List[Dict[str, Any]] = []
    losses: List[Dict[str, Any]] = []
    e4_gains: List[Dict[str, Any]] = []

    total_gross_discounted = Decimal("0")
    total_net_discounted = Decimal("0")
    total_non_discounted = Decimal("0")
    total_losses = Decimal("0")
    total_e4_discounted = Decimal("0")
    total_e4_non_discounted = Decimal("0")

    for h in holdings:
        inst = db.query(Instrument).filter(Instrument.id == h.instrument_id).first()
        symbol = inst.symbol if inst else ""

        # Replay events up to end_date
        events = [ev for ev in build_events_for_holding(db, h.id) if ev.date <= end_date]
        _, realised_events, e4_events = replay_cgt_events(events)

        # Filter events in FY
        fy_realised = [r for r in realised_events if start_date <= r.sell_date <= end_date]
        fy_e4 = [e for e in e4_events if start_date <= e.date <= end_date]

        for r in fy_realised:
            item = {
                "symbol": symbol,
                "holding_id": h.id,
                "sell_date": r.sell_date.isoformat(),
                "acquire_date": r.acquire_date.isoformat(),
                "quantity": f"{r.qty:.4f}",
                "proceeds": f"{r.proceeds_share:.4f}",
                "cost_base": f"{r.cost_base_share:.4f}",
                "gross_gain_loss": f"{r.gain:.4f}",
                "discount_eligible": r.discount_eligible
            }

            if r.gain < Decimal("0"):
                loss_amt = -r.gain
                item["loss_amount"] = f"{loss_amt:.4f}"
                losses.append(item)
                total_losses += loss_amt
            else:
                if r.discount_eligible:
                    net_gain = r.gain * Decimal("0.5")
                    item["net_taxable_gain"] = f"{net_gain:.4f}"
                    discounted_gains.append(item)
                    total_gross_discounted += r.gain
                    total_net_discounted += net_gain
                else:
                    item["net_taxable_gain"] = f"{r.gain:.4f}"
                    non_discounted_gains.append(item)
                    total_non_discounted += r.gain

        for e in fy_e4:
            item = {
                "symbol": symbol,
                "holding_id": h.id,
                "date": e.date.isoformat(),
                "acquire_date": e.acquire_date.isoformat(),
                "amount": f"{e.amount:.4f}",
                "discount_eligible": e.discount_eligible
            }
            if e.discount_eligible:
                net_e4 = e.amount * Decimal("0.5")
                item["net_taxable_amount"] = f"{net_e4:.4f}"
                total_e4_discounted += e.amount
            else:
                item["net_taxable_amount"] = f"{e.amount:.4f}"
                total_e4_non_discounted += e.amount
            e4_gains.append(item)

    # Calculate net taxable gain per ATO methodology:
    # 1. Offset current-year losses against non-discounted gains first
    gross_discounted_pool = total_gross_discounted + total_e4_discounted
    non_discounted_pool = total_non_discounted + total_e4_non_discounted

    loss_offset_non_disc = min(total_losses, non_discounted_pool)
    rem_losses = total_losses - loss_offset_non_disc
    rem_non_disc = non_discounted_pool - loss_offset_non_disc

    # 2. Offset remaining losses against gross discounted gains
    loss_offset_disc = min(rem_losses, gross_discounted_pool)
    rem_losses = rem_losses - loss_offset_disc
    rem_gross_disc = gross_discounted_pool - loss_offset_disc

    # 3. Apply 50% discount to remaining gross discounted gains
    taxable_discounted = rem_gross_disc * Decimal("0.5")

    net_taxable_position = rem_non_disc + taxable_discounted
    carry_forward_loss = rem_losses

    return {
        "fy": fy,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "discounted_gains": discounted_gains,
        "non_discounted_gains": non_discounted_gains,
        "losses": losses,
        "e4_gains": e4_gains,
        "summary": {
            "gross_discounted_gains": f"{total_gross_discounted:.4f}",
            "net_discounted_gains": f"{total_net_discounted:.4f}",
            "non_discounted_gains": f"{total_non_discounted:.4f}",
            "total_losses": f"{total_losses:.4f}",
            "e4_discounted_gains": f"{total_e4_discounted:.4f}",
            "e4_non_discounted_gains": f"{total_e4_non_discounted:.4f}",
            "net_taxable_position": f"{net_taxable_position:.4f}",
            "carry_forward_loss": f"{carry_forward_loss:.4f}"
        }
    }


def generate_income_report(db: Session, portfolio_id: int, fy: int) -> Dict[str, Any]:
    start_date, end_date = get_fy_date_range(fy)
    holdings = db.query(Holding).filter(Holding.portfolio_id == portfolio_id).all()

    items: List[Dict[str, Any]] = []
    tot_gross = Decimal("0")
    tot_franking = Decimal("0")
    tot_inc = Decimal("0")
    tot_dec = Decimal("0")
    tot_net = Decimal("0")

    for h in holdings:
        inst = db.query(Instrument).filter(Instrument.id == h.instrument_id).first()
        symbol = inst.symbol if inst else ""

        dists = db.query(Distribution).filter(
            Distribution.holding_id == h.id,
            Distribution.pay_date >= start_date,
            Distribution.pay_date <= end_date
        ).order_by(Distribution.pay_date.asc()).all()

        for d in dists:
            gross = Decimal(str(d.gross_amount))
            frank = Decimal(str(d.franking_credits or "0"))
            inc = Decimal(str(d.amit_cost_base_increase or "0"))
            dec = Decimal(str(d.amit_cost_base_decrease or "0"))
            net = Decimal(str(d.net_payment))

            tot_gross += gross
            tot_franking += frank
            tot_inc += inc
            tot_dec += dec
            tot_net += net

            items.append({
                "symbol": symbol,
                "holding_id": h.id,
                "distribution_id": d.id,
                "pay_date": d.pay_date.isoformat(),
                "ex_date": d.ex_date.isoformat() if d.ex_date else None,
                "gross_amount": f"{gross:.4f}",
                "franking_credits": f"{frank:.4f}",
                "amit_cost_base_increase": f"{inc:.4f}",
                "amit_cost_base_decrease": f"{dec:.4f}",
                "net_payment": f"{net:.4f}",
                "notes": d.notes or ""
            })

    return {
        "fy": fy,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "distributions": items,
        "summary": {
            "total_gross_amount": f"{tot_gross:.4f}",
            "total_franking_credits": f"{tot_franking:.4f}",
            "total_amit_increase": f"{tot_inc:.4f}",
            "total_amit_decrease": f"{tot_dec:.4f}",
            "total_net_payment": f"{tot_net:.4f}"
        }
    }


def export_cgt_csv(report: Dict[str, Any]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ETFolio Realised CGT Report", f"FY{report['fy']} ({report['start_date']} to {report['end_date']})"])
    writer.writerow([])
    writer.writerow(["Discounted Gains"])
    writer.writerow(["Symbol", "Sell Date", "Acquire Date", "Quantity", "Proceeds", "Cost Base", "Gross Gain", "Net Taxable Gain"])
    for g in report["discounted_gains"]:
        writer.writerow([g["symbol"], g["sell_date"], g["acquire_date"], g["quantity"], g["proceeds"], g["cost_base"], g["gross_gain_loss"], g["net_taxable_gain"]])
    writer.writerow([])
    writer.writerow(["Non-Discounted Gains"])
    writer.writerow(["Symbol", "Sell Date", "Acquire Date", "Quantity", "Proceeds", "Cost Base", "Gross Gain", "Net Taxable Gain"])
    for g in report["non_discounted_gains"]:
        writer.writerow([g["symbol"], g["sell_date"], g["acquire_date"], g["quantity"], g["proceeds"], g["cost_base"], g["gross_gain_loss"], g["net_taxable_gain"]])
    writer.writerow([])
    writer.writerow(["Capital Losses"])
    writer.writerow(["Symbol", "Sell Date", "Acquire Date", "Quantity", "Proceeds", "Cost Base", "Loss Amount"])
    for l in report["losses"]:
        writer.writerow([l["symbol"], l["sell_date"], l["acquire_date"], l["quantity"], l["proceeds"], l["cost_base"], l["loss_amount"]])
    writer.writerow([])
    writer.writerow(["AMIT E4 Gains"])
    writer.writerow(["Symbol", "Date", "Acquire Date", "Amount", "Discount Eligible", "Net Taxable Amount"])
    for e in report["e4_gains"]:
        writer.writerow([e["symbol"], e["date"], e["acquire_date"], e["amount"], e["discount_eligible"], e["net_taxable_amount"]])
    writer.writerow([])
    writer.writerow(["Summary"])
    for k, v in report["summary"].items():
        writer.writerow([k, v])
    return output.getvalue()


def export_income_csv(report: Dict[str, Any]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ETFolio Taxable Income Report", f"FY{report['fy']} ({report['start_date']} to {report['end_date']})"])
    writer.writerow([])
    writer.writerow(["Symbol", "Pay Date", "Ex Date", "Gross Amount", "Franking Credits", "AMIT Increase", "AMIT Decrease", "Net Payment", "Notes"])
    for d in report["distributions"]:
        writer.writerow([d["symbol"], d["pay_date"], d["ex_date"] or "", d["gross_amount"], d["franking_credits"], d["amit_cost_base_increase"], d["amit_cost_base_decrease"], d["net_payment"], d["notes"]])
    writer.writerow([])
    writer.writerow(["Summary"])
    for k, v in report["summary"].items():
        writer.writerow([k, v])
    return output.getvalue()
