import csv
import io
import re
import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session

from app.models.models import ImportBatch, Trade, Holding, Instrument
from app.services.pricing import ensure_instrument
from app.services.cgt import validate_holding_stream, OversellError

_DECIMAL_JUNK_RE = re.compile(r"[^0-9.\-]")


def parse_decimal(value: str) -> Decimal:
    """Parse a numeric CSV cell, tolerating spreadsheet currency formatting
    (e.g. "$141.20 ", "1,234.56") that Decimal() alone rejects."""
    cleaned = _DECIMAL_JUNK_RE.sub("", value.strip())
    if not cleaned or cleaned == "-":
        raise InvalidOperation(f"'{value}' is not a number")
    return Decimal(cleaned)


def parse_date(date_str: str) -> datetime.date:
    date_str = date_str.strip()
    # Try dd/mm/yyyy
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.datetime.strptime(date_str, fmt).date()
        except ValueError:
            pass
    raise ValueError(f"Invalid date format: {date_str}")


def find_column(header: List[str], keywords: List[str], exclude: Optional[List[str]] = None) -> Optional[int]:
    header_lower = [h.strip().lower() for h in header]
    for kw in keywords:
        for idx, h in enumerate(header_lower):
            if kw in h and not (exclude and any(ex in h for ex in exclude)):
                return idx
    return None


TEMPLATE_HEADERS = ["Symbol", "Date", "Type", "Quantity", "Price", "Brokerage", "Broker", "Notes"]
TEMPLATE_EXAMPLE_ROWS = [
    ["VAS", "15/01/2025", "BUY", "50", "90.00", "9.95", "Stake", "Example row - replace with your own data"],
    ["VAS", "20/02/2025", "SELL", "10", "95.00", "9.95", "Stake", "Example row - replace with your own data"],
]


def build_import_template_csv() -> bytes:
    """Generic trade import template. Column names match the keywords parse_trades_csv
    looks for, so this file (and most broker/tracking-tool exports using similar
    headers, e.g. Sharesight's "All trades" export) both import cleanly."""
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(TEMPLATE_HEADERS)
    writer.writerows(TEMPLATE_EXAMPLE_ROWS)
    return stream.getvalue().encode("utf-8")


def parse_trades_csv(csv_bytes: bytes) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    content = csv_bytes.decode("utf-8-sig", errors="replace")
    stream = io.StringIO(content)
    reader = csv.reader(stream)

    header = next(reader, None)
    if not header:
        return [], [{"row": 0, "error": "CSV file is empty"}]

    col_market = find_column(header, ["market"])
    col_code = find_column(header, ["code", "instrument", "ticker", "symbol"])
    col_date = find_column(header, ["trade date", "date", "transaction date"])
    col_type = find_column(header, ["type", "transaction type"])
    col_qty = find_column(header, ["quantity", "qty", "units"])
    col_price = find_column(header, ["price", "unit price"])
    col_broker = find_column(header, ["broker"], exclude=["brokerage"])
    col_brokerage = find_column(header, ["brokerage", "fee", "fees"])
    col_comments = find_column(header, ["comments", "notes"])

    if col_code is None or col_date is None or col_type is None or col_qty is None or col_price is None:
        return [], [{"row": 0, "error": "Missing required column headers (Code, Date, Type, Quantity, Price)"}]

    valid_rows = []
    error_rows = []

    # 1-indexed against data rows only (header excluded), so "row" matches
    # the position a user would count in their spreadsheet after the header.
    for row_idx, row in enumerate(reader, start=1):
        if not row or not any(row):
            continue

        try:
            # Check market if column present
            if col_market is not None and col_market < len(row):
                market = row[col_market].strip().upper()
                if market and market not in ("AX", "ASX"):
                    error_rows.append({"row": row_idx, "error": f"Non-ASX market '{market}' rejected (ASX only)"})
                    continue

            code = row[col_code].strip().upper() if col_code < len(row) else ""
            if not code:
                error_rows.append({"row": row_idx, "error": "Missing instrument code"})
                continue

            symbol = code if code.endswith(".AX") else f"{code}.AX"

            date_str = row[col_date].strip() if col_date < len(row) else ""
            trade_date = parse_date(date_str)

            ttype = row[col_type].strip().upper() if col_type < len(row) else ""
            if ttype not in ("BUY", "SELL"):
                error_rows.append({"row": row_idx, "error": f"Invalid trade type '{ttype}' (must be BUY or SELL)"})
                continue

            qty_str = row[col_qty].strip() if col_qty < len(row) else ""
            qty = parse_decimal(qty_str)
            if qty <= Decimal("0"):
                error_rows.append({"row": row_idx, "error": f"Quantity must be positive (got {qty_str})"})
                continue

            price_str = row[col_price].strip() if col_price < len(row) else ""
            price = parse_decimal(price_str)
            if price < Decimal("0"):
                error_rows.append({"row": row_idx, "error": f"Price cannot be negative (got {price_str})"})
                continue

            brokerage_str = "0"
            if col_brokerage is not None and col_brokerage < len(row) and row[col_brokerage].strip():
                brokerage_str = str(parse_decimal(row[col_brokerage].strip()))

            broker = row[col_broker].strip() if (col_broker is not None and col_broker < len(row)) else ""

            comments = row[col_comments].strip() if (col_comments is not None and col_comments < len(row)) else ""

            valid_rows.append({
                "row": row_idx,
                "symbol": symbol,
                "type": ttype,
                "trade_date": trade_date,
                "quantity": f"{qty:.4f}",
                "unit_price": f"{price:.4f}",
                "broker": broker,
                "brokerage": brokerage_str,
                "notes": comments,
                "sell_allocation_method": "min_cgt" if ttype == "SELL" else None
            })
        except Exception as e:
            error_rows.append({"row": row_idx, "error": str(e)})

    return valid_rows, error_rows


def preview_import(csv_bytes: bytes) -> Dict[str, Any]:
    valid, errors = parse_trades_csv(csv_bytes)
    return {
        "valid_count": len(valid),
        "error_count": len(errors),
        "valid_rows": valid,
        "error_rows": errors
    }


def commit_import(
    db: Session, portfolio_id: int, filename: str, csv_bytes: bytes
) -> Tuple[ImportBatch, List[int], List[Tuple[str, datetime.date]]]:
    valid_rows, error_rows = parse_trades_csv(csv_bytes)
    if error_rows and not valid_rows:
        raise ValueError(f"Import failed: all rows had errors ({error_rows[0]['error']})")

    batch = ImportBatch(
        portfolio_id=portfolio_id,
        filename=filename,
        imported_at=datetime.datetime.now(datetime.UTC).replace(tzinfo=None),
        row_count=len(valid_rows)
    )
    db.add(batch)
    db.flush()

    affected_holdings = set()
    instruments_to_backfill = set()

    for r in valid_rows:
        inst = ensure_instrument(db, r["symbol"])
        instruments_to_backfill.add(inst)

        holding = db.query(Holding).filter(
            Holding.portfolio_id == portfolio_id,
            Holding.instrument_id == inst.id
        ).first()

        if not holding:
            holding = Holding(portfolio_id=portfolio_id, instrument_id=inst.id)
            db.add(holding)
            db.flush()

        affected_holdings.add(holding.id)

        trade = Trade(
            holding_id=holding.id,
            type=r["type"],
            trade_date=r["trade_date"],
            quantity=r["quantity"],
            unit_price=r["unit_price"],
            broker=r["broker"],
            brokerage=r["brokerage"],
            notes=r["notes"],
            sell_allocation_method=r["sell_allocation_method"],
            import_batch_id=batch.id
        )
        db.add(trade)

    db.flush()

    # Run validation replay for all affected holdings
    for hid in affected_holdings:
        try:
            validate_holding_stream(db, hid)
        except OversellError as e:
            db.rollback()
            raise ValueError(f"Oversell error in batch import on holding {hid}: sell {e.sell_qty} on {e.date} exceeds available {e.available_qty}")

    db.commit()
    db.refresh(batch)

    # Price backfill hits Yahoo Finance once per new instrument with its own
    # retry/backoff loop — synchronously blocking here made large imports
    # (or a rate-limited/slow Yahoo Finance) hang the commit request for
    # minutes. Trades are already durably committed above, so return plain
    # (symbol, earliest_date) pairs and let the caller run backfill_prices()
    # out-of-band (e.g. via FastAPI BackgroundTasks) instead of blocking here.
    backfill_targets = [
        (
            inst.symbol,
            min((r["trade_date"] for r in valid_rows if r["symbol"] == inst.symbol), default=datetime.date.today())
        )
        for inst in instruments_to_backfill
    ]

    return batch, list(affected_holdings), backfill_targets


def undo_import(db: Session, batch_id: int) -> None:
    batch = db.query(ImportBatch).filter(ImportBatch.id == batch_id).first()
    if not batch:
        raise ValueError("Import batch not found")

    trades = db.query(Trade).filter(Trade.import_batch_id == batch_id).all()
    affected_holdings = {t.holding_id for t in trades}

    for t in trades:
        db.delete(t)

    db.flush()

    for hid in affected_holdings:
        try:
            validate_holding_stream(db, hid)
        except OversellError as e:
            db.rollback()
            raise ValueError(f"Cannot undo import batch: deleting trades causes oversell on holding {hid} ({e})")

    db.delete(batch)
    db.commit()
