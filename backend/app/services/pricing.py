import asyncio
import datetime
from decimal import Decimal, InvalidOperation
from typing import List, Dict, Any, Optional
import httpx
import yfinance as yf
from sqlalchemy.orm import Session
from app.models.models import Instrument, PriceHistory, Holding

# Semaphore for serializing Yahoo calls
_yahoo_semaphore = asyncio.Semaphore(1)
_search_cache: Dict[str, tuple[datetime.datetime, List[Dict[str, str]]]] = {}
CACHE_TTL_SECONDS = 86400

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


async def symbol_search(query: str) -> List[Dict[str, str]]:
    query_clean = query.strip().upper()
    if not query_clean:
        return []

    # Check cache
    now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
    if query_clean in _search_cache:
        timestamp, cached_res = _search_cache[query_clean]
        if (now - timestamp).total_seconds() < CACHE_TTL_SECONDS:
            return cached_res

    url = f"https://query1.finance.yahoo.com/v1/finance/search?q={query_clean}&quotesCount=15&newsCount=0"
    headers = {"User-Agent": USER_AGENT}

    async with _yahoo_semaphore:
        await asyncio.sleep(0.5)
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.get(url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    quotes = data.get("quotes", [])
                    results = []
                    for q in quotes:
                        symbol = q.get("symbol", "")
                        if symbol.endswith(".AX"):
                            name = q.get("shortname") or q.get("longname") or q.get("name") or symbol
                            results.append({"symbol": symbol, "name": name})
                    _search_cache[query_clean] = (now, results)
                    return results
            except Exception:
                pass

    # Fallback search matching query + .AX if query is ticker
    fallback_symbol = f"{query_clean}.AX" if not query_clean.endswith(".AX") else query_clean
    return [{"symbol": fallback_symbol, "name": fallback_symbol}]


def ensure_instrument(db: Session, symbol: str) -> Instrument:
    symbol_clean = symbol.strip().upper()
    if not symbol_clean.endswith(".AX"):
        symbol_clean = f"{symbol_clean}.AX"

    inst = db.query(Instrument).filter(Instrument.symbol == symbol_clean).first()
    if inst:
        return inst

    # Try fetching long name via yfinance or fallback
    name = symbol_clean.replace(".AX", "")
    try:
        ticker = yf.Ticker(symbol_clean)
        info = ticker.info
        name = info.get("longName") or info.get("shortName") or name
    except Exception:
        pass

    inst = Instrument(
        symbol=symbol_clean,
        name=name,
        exchange="ASX",
        currency="AUD"
    )
    db.add(inst)
    db.flush()
    return inst


import threading
import time

_sync_yahoo_lock = threading.Lock()

def backfill_prices(db: Session, instrument: Instrument, since_date: datetime.date) -> None:
    """Fetch daily price history from Yahoo Finance and upsert raw Close."""
    symbol = instrument.symbol
    start_str = since_date.isoformat()
    end_str = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()

    closes: Dict[datetime.date, str] = {}

    with _sync_yahoo_lock:
        time.sleep(0.5)
        for attempt in range(3):
            try:
                ticker = yf.Ticker(symbol)
                df = ticker.history(start=start_str, end=end_str, interval="1d", auto_adjust=False)
                if not df.empty and "Close" in df.columns:
                    for idx, row in df.iterrows():
                        dt = idx.date()
                        close_val = row["Close"]
                        if not (close_val != close_val):  # NaN check
                            closes[dt] = f"{Decimal(str(close_val)):.4f}"
                if closes:
                    break
            except Exception:
                time.sleep(1.0 * (2 ** attempt))

        # Fallback to direct chart API if yfinance returned empty
        if not closes:
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1=0&period2=9999999999&interval=1d"
            headers = {"User-Agent": USER_AGENT}
            for attempt in range(3):
                try:
                    with httpx.Client(timeout=10.0) as client:
                        resp = client.get(url, headers=headers)
                        if resp.status_code == 200:
                            data = resp.json()
                            result = data.get("chart", {}).get("result", [{}])[0]
                            timestamps = result.get("timestamp", [])
                            quote = result.get("indicators", {}).get("quote", [{}])[0]
                            close_list = quote.get("close", [])
                            for ts, val in zip(timestamps, close_list):
                                if ts and val is not None:
                                    dt = datetime.datetime.fromtimestamp(ts, datetime.UTC).date()
                                    if dt >= since_date:
                                        closes[dt] = f"{Decimal(str(val)):.4f}"
                            if closes:
                                break
                except Exception:
                    time.sleep(1.0 * (2 ** attempt))

    if not closes:
        return

    latest_date = max(closes.keys())
    latest_price = closes[latest_date]

    for dt, price_str in closes.items():
        existing = db.query(PriceHistory).filter(
            PriceHistory.instrument_id == instrument.id,
            PriceHistory.date == dt
        ).first()
        if existing:
            existing.close = price_str
        else:
            ph = PriceHistory(
                instrument_id=instrument.id,
                date=dt,
                close=price_str
            )
            db.add(ph)

    instrument.last_price = latest_price
    instrument.last_price_date = latest_date
    db.commit()


def append_eod(db: Session) -> None:
    """Fetch trailing 7 days for instruments referenced by holdings, skipping if current."""
    holdings = db.query(Holding).all()
    instrument_ids = {h.instrument_id for h in holdings}
    if not instrument_ids:
        return

    today = datetime.date.today()
    since_date = today - datetime.timedelta(days=7)
    instruments = db.query(Instrument).filter(Instrument.id.in_(instrument_ids)).all()

    from sqlalchemy import func
    for inst in instruments:
        latest = db.query(func.max(PriceHistory.date)).filter(PriceHistory.instrument_id == inst.id).scalar()
        # If latest price is within 1 day (or today), skip Yahoo request
        if latest and (today - latest).days <= 1:
            continue
        backfill_prices(db, inst, since_date)
