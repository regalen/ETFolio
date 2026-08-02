import io
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient

def test_trade_oversell_rejection_and_drp_cascade(client: TestClient):
    # Register & login
    client.post("/api/auth/register", json={"username": "testuser", "password": "password123"})
    client.post("/api/auth/login", json={"username": "testuser", "password": "password123"})

    # Create portfolio
    p_resp = client.post("/api/portfolios", json={"name": "My Portfolio"})
    p_id = p_resp.json()["id"]

    # 1. Create BUY trade for VAS
    buy_resp = client.post(f"/api/portfolios/{p_id}/trades", json={
        "symbol": "VAS",
        "type": "BUY",
        "trade_date": "2025-01-01",
        "quantity": "50",
        "unit_price": "90.00",
        "brokerage": "10.00"
    })
    assert buy_resp.status_code == 201
    h_id = buy_resp.json()["holding_id"]

    # 2. Attempt oversell (SELL 60 when only 50 held) -> HTTP 422
    sell_fail = client.post(f"/api/portfolios/{p_id}/trades", json={
        "symbol": "VAS",
        "type": "SELL",
        "trade_date": "2025-02-01",
        "quantity": "60",
        "unit_price": "95.00",
        "brokerage": "10.00"
    })
    assert sell_fail.status_code == 422
    assert "Oversell" in sell_fail.json()["detail"]

    # Valid SELL 20
    sell_ok = client.post(f"/api/portfolios/{p_id}/trades", json={
        "symbol": "VAS",
        "type": "SELL",
        "trade_date": "2025-02-01",
        "quantity": "20",
        "unit_price": "95.00",
        "brokerage": "10.00"
    })
    assert sell_ok.status_code == 201

    # 3. Create distribution with DRP reinvestment
    dist_resp = client.post(f"/api/holdings/{h_id}/distributions", json={
        "pay_date": "2025-03-01",
        "gross_amount": "100.00",
        "reinvestment": {
            "units": "1",
            "price": "92.00"
        }
    })
    assert dist_resp.status_code == 201
    dist_id = dist_resp.json()["id"]
    reinvested_trade_id = dist_resp.json()["reinvested_trade_id"]
    assert reinvested_trade_id is not None

    # Deleting distribution without cascade -> 400
    del_dist_fail = client.delete(f"/api/distributions/{dist_id}")
    assert del_dist_fail.status_code == 400
    assert "Pass ?cascade=true" in del_dist_fail.json()["detail"]

    # Deleting linked trade without cascade -> 400
    del_trade_fail = client.delete(f"/api/trades/{reinvested_trade_id}")
    assert del_trade_fail.status_code == 400

    # Deleting distribution with cascade -> 204
    del_dist_ok = client.delete(f"/api/distributions/{dist_id}?cascade=true")
    assert del_dist_ok.status_code == 204

def test_csv_import_and_undo(client: TestClient):
    client.post("/api/auth/register", json={"username": "csvuser", "password": "password123"})
    client.post("/api/auth/login", json={"username": "csvuser", "password": "password123"})
    p_id = client.post("/api/portfolios", json={"name": "Import Portfolio"}).json()["id"]

    csv_content = """Market,Code,Trade Date,Type,Quantity,Price,Brokerage,Comments
ASX,VAS,15/01/2025,BUY,10,85.50,9.95,Initial buy
ASX,VGS,20/01/2025,BUY,20,110.00,9.95,Global buy
"""
    # Preview
    files = {"file": ("all_trades.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    prev = client.post(f"/api/portfolios/{p_id}/import/preview", files=files)
    assert prev.status_code == 200
    assert prev.json()["valid_count"] == 2

    # Commit
    files = {"file": ("all_trades.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    commit_resp = client.post(f"/api/portfolios/{p_id}/import/commit", files=files)
    assert commit_resp.status_code == 200
    batch_id = commit_resp.json()["batch_id"]

    # Holdings created
    holdings = client.get(f"/api/portfolios/{p_id}/holdings").json()
    assert len(holdings) == 2

    # Undo
    undo_resp = client.delete(f"/api/import-batches/{batch_id}")
    assert undo_resp.status_code == 204

    # Holdings remain but trades deleted
    holdings_after = client.get(f"/api/portfolios/{p_id}/holdings").json()
    assert all(Decimal(h["quantity"]) == Decimal("0") for h in holdings_after)


def test_csv_import_row_numbers_exclude_header(client: TestClient):
    """Row numbers shown in the preview must count data rows only (1-indexed),
    not the CSV's own line numbers (which would start at 2 after the header)."""
    client.post("/api/auth/register", json={"username": "rownumuser", "password": "password123"})
    client.post("/api/auth/login", json={"username": "rownumuser", "password": "password123"})
    p_id = client.post("/api/portfolios", json={"name": "Row Number Portfolio"}).json()["id"]

    csv_content = """Symbol,Date,Type,Quantity,Price,Brokerage,Notes
VAS,15/01/2025,BUY,10,85.50,9.95,ok
VAS,16/01/2025,HOLD,10,85.50,9.95,invalid type
VAS,17/01/2025,BUY,10,85.50,9.95,ok
"""
    files = {"file": ("rows.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    prev = client.post(f"/api/portfolios/{p_id}/import/preview", files=files)
    assert prev.status_code == 200
    data = prev.json()
    assert data["valid_count"] == 2
    assert [r["row"] for r in data["valid_rows"]] == [1, 3]
    assert [e["row"] for e in data["error_rows"]] == [2]


def test_csv_import_tolerates_spreadsheet_currency_formatting(client: TestClient):
    """Regression test: values exported from Excel/Numbers currency-formatted cells
    (e.g. "$141.20 " with a leading $ and trailing space, CRLF line endings) must
    still parse instead of raising decimal.InvalidOperation on every row."""
    client.post("/api/auth/register", json={"username": "spreadsheetuser", "password": "password123"})
    client.post("/api/auth/login", json={"username": "spreadsheetuser", "password": "password123"})
    p_id = client.post("/api/portfolios", json={"name": "Spreadsheet Portfolio"}).json()["id"]

    csv_content = (
        "Symbol,Date,Type,Quantity,Price,Brokerage,Notes\r\n"
        "VGS,28/2/2025,BUY,111,$141.20 ,$3.00 ,\r\n"
        "VAS,3/3/2025,BUY,1,\"$1,101.87\",$3.00 ,\r\n"
    )
    files = {"file": ("export.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    prev = client.post(f"/api/portfolios/{p_id}/import/preview", files=files)
    assert prev.status_code == 200
    data = prev.json()
    assert data["error_count"] == 0, data["error_rows"]
    assert data["valid_count"] == 2
    assert data["valid_rows"][0]["unit_price"] == "141.2000"
    assert data["valid_rows"][0]["brokerage"] == "3.00"
    assert data["valid_rows"][1]["unit_price"] == "1101.8700"


def test_csv_import_commit_backfills_prices_via_background_task(client: TestClient, setup_test_db):
    """Regression test: price backfill for newly-seen instruments must happen
    via a background task (not block the commit response), and must still
    actually run and populate price_history rather than silently vanishing."""
    from app.models.models import Instrument, PriceHistory

    client.post("/api/auth/register", json={"username": "bgpriceuser", "password": "password123"})
    client.post("/api/auth/login", json={"username": "bgpriceuser", "password": "password123"})
    p_id = client.post("/api/portfolios", json={"name": "Background Price Portfolio"}).json()["id"]

    csv_content = """Symbol,Date,Type,Quantity,Price,Brokerage,Notes
VAS,15/01/2025,BUY,10,85.50,9.95,ok
"""
    files = {"file": ("bg.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    commit_resp = client.post(f"/api/portfolios/{p_id}/import/commit", files=files)
    assert commit_resp.status_code == 200

    db = setup_test_db()
    try:
        inst = db.query(Instrument).filter(Instrument.symbol == "VAS.AX").first()
        assert inst is not None
        price_rows = db.query(PriceHistory).filter(PriceHistory.instrument_id == inst.id).count()
        assert price_rows > 0
    finally:
        db.close()


def test_csv_import_broker_column(client: TestClient):
    """Broker (execution venue name) must import distinctly from brokerage
    (the fee amount) despite the substring overlap between the two header
    names, and must persist through to the committed trade."""
    client.post("/api/auth/register", json={"username": "brokeruser", "password": "password123"})
    client.post("/api/auth/login", json={"username": "brokeruser", "password": "password123"})
    p_id = client.post("/api/portfolios", json={"name": "Broker Portfolio"}).json()["id"]

    csv_content = """Symbol,Date,Type,Quantity,Price,Broker,Brokerage,Notes
VAS,15/01/2025,BUY,10,85.50,Stake,9.95,ok
"""
    files = {"file": ("broker.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    prev = client.post(f"/api/portfolios/{p_id}/import/preview", files=files)
    assert prev.status_code == 200
    data = prev.json()
    assert data["error_count"] == 0
    assert data["valid_rows"][0]["broker"] == "Stake"
    assert data["valid_rows"][0]["brokerage"] == "9.95"

    files = {"file": ("broker.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    commit_resp = client.post(f"/api/portfolios/{p_id}/import/commit", files=files)
    assert commit_resp.status_code == 200
    holdings = client.get(f"/api/portfolios/{p_id}/holdings").json()
    h_id = holdings[0]["id"]
    trades = client.get(f"/api/holdings/{h_id}/trades").json()
    assert trades[0]["broker"] == "Stake"
    assert trades[0]["brokerage"] == "9.95"

    # A file with only a "Brokerage" column (no separate Broker column) must
    # not misread the fee amount as the broker name.
    csv_no_broker = """Symbol,Date,Type,Quantity,Price,Brokerage,Notes
VAS,16/01/2025,BUY,5,86.00,9.95,ok
"""
    files = {"file": ("no_broker.csv", io.BytesIO(csv_no_broker.encode("utf-8")), "text/csv")}
    prev2 = client.post(f"/api/portfolios/{p_id}/import/preview", files=files)
    assert prev2.status_code == 200
    assert prev2.json()["valid_rows"][0]["broker"] == ""
    assert prev2.json()["valid_rows"][0]["brokerage"] == "9.95"


def test_import_template_download_and_roundtrip(client: TestClient):
    client.post("/api/auth/register", json={"username": "templateuser", "password": "password123"})
    client.post("/api/auth/login", json={"username": "templateuser", "password": "password123"})

    resp = client.get("/api/import/template")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "attachment" in resp.headers["content-disposition"]

    # The template itself must be a valid, error-free import (dogfooding the format we hand to users)
    p_id = client.post("/api/portfolios", json={"name": "Template Portfolio"}).json()["id"]
    files = {"file": ("etfolio_trade_import_template.csv", io.BytesIO(resp.content), "text/csv")}
    prev = client.post(f"/api/portfolios/{p_id}/import/preview", files=files)
    assert prev.status_code == 200
    assert prev.json()["error_count"] == 0
    assert prev.json()["valid_count"] == 2


def test_csv_import_atomic_rollback_on_oversell(client: TestClient):
    """Regression test for Item 3: CSV import failure on oversell must cleanly rollback everything."""
    client.post("/api/auth/register", json={"username": "atomicuser", "password": "password123"})
    client.post("/api/auth/login", json={"username": "atomicuser", "password": "password123"})
    p_id = client.post("/api/portfolios", json={"name": "Atomic Portfolio"}).json()["id"]

    # CSV with 1 BUY row followed by an overselling SELL row
    csv_content = """Market,Code,Trade Date,Type,Quantity,Price,Brokerage,Comments
ASX,VAS,15/01/2025,BUY,10,85.50,9.95,Initial buy
ASX,VAS,20/01/2025,SELL,50,90.00,9.95,Oversell 50 > 10
"""
    files = {"file": ("oversell.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")}
    commit_resp = client.post(f"/api/portfolios/{p_id}/import/commit", files=files)
    assert commit_resp.status_code == 400
    assert "Oversell" in commit_resp.json()["detail"]

    # Assert ZERO holdings and ZERO trades persist
    holdings = client.get(f"/api/portfolios/{p_id}/holdings").json()
    assert len(holdings) == 0

