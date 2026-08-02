import datetime
from decimal import Decimal
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models.models import User, Portfolio, Holding, Instrument, Trade, PriceHistory
from app.services.valuation import compute_holding_metrics

def test_capital_gain_metric_single_buy_on_t0(tmp_path):
    """Regression test for Item 2: single buy on t0 with flat price must yield capital_gain = -brokerage."""
    db_file = tmp_path / "test_val.sqlite3"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        user = User(username="t2user", password_hash="hash")
        db.add(user)
        db.flush()

        portfolio = Portfolio(owner_id=user.id, name="Test Portfolio")
        db.add(portfolio)
        db.flush()

        inst = Instrument(symbol="ABC.AX", name="ABC ETF")
        db.add(inst)
        db.flush()

        holding = Holding(portfolio_id=portfolio.id, instrument_id=inst.id)
        db.add(holding)
        db.flush()

        t0 = datetime.date(2025, 1, 1)
        t1 = datetime.date(2025, 1, 10)

        # Single buy on t0: 10 units @ $100 + $5 fee -> cost $1005
        trade = Trade(
            holding_id=holding.id,
            type="BUY",
            trade_date=t0,
            quantity="10",
            unit_price="100.00",
            brokerage="5.00"
        )
        db.add(trade)

        # Flat price history: $100.00
        curr = t0
        while curr <= t1:
            db.add(PriceHistory(instrument_id=inst.id, date=curr, close="100.0000"))
            curr += datetime.timedelta(days=1)

        db.flush()

        metrics = compute_holding_metrics(db, holding, t0, t1)

        # Capital gain should be -$5.0000 (i.e. -brokerage)
        assert metrics["capital_gain"] == "-5.0000"
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
