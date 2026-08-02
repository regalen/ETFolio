import datetime
from decimal import Decimal
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models.models import User, Portfolio, Holding, Instrument, Trade
from app.services.reports import generate_cgt_report

def test_cgt_report_100_gross_discounted_and_100_loss(tmp_path):
    """Regression test for Item 5: $100 gross discounted gain + $100 loss must yield $0 net taxable and $0 carry-forward loss."""
    db_file = tmp_path / "test_cgt1.sqlite3"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        user = User(username="reportuser", password_hash="hash")
        db.add(user)
        db.flush()

        portfolio = Portfolio(owner_id=user.id, name="Report Portfolio")
        db.add(portfolio)
        db.flush()

        inst = Instrument(symbol="VAS.AX", name="Vanguard Australian Shares")
        db.add(inst)
        db.flush()

        holding = Holding(portfolio_id=portfolio.id, instrument_id=inst.id)
        db.add(holding)
        db.flush()

        fy = 2026 # 1 Jul 2025 - 30 Jun 2026

        # Parcel 1 (Discounted gain): Bought 2024-01-01 (held > 12m), 10 units @ $10. Sell 2025-08-01 10 units @ $20 -> Gross gain $100
        b1 = Trade(holding_id=holding.id, type="BUY", trade_date=datetime.date(2024, 1, 1), quantity="10", unit_price="10.00", brokerage="0")
        s1 = Trade(holding_id=holding.id, type="SELL", trade_date=datetime.date(2025, 8, 1), quantity="10", unit_price="20.00", brokerage="0", sell_allocation_method="fifo")

        # Parcel 2 (Loss): Bought 2025-07-01, 10 units @ $20. Sell 2025-09-01 10 units @ $10 -> Loss -$100
        b2 = Trade(holding_id=holding.id, type="BUY", trade_date=datetime.date(2025, 7, 1), quantity="10", unit_price="20.00", brokerage="0")
        s2 = Trade(holding_id=holding.id, type="SELL", trade_date=datetime.date(2025, 9, 1), quantity="10", unit_price="10.00", brokerage="0", sell_allocation_method="lifo")

        db.add_all([b1, s1, b2, s2])
        db.flush()

        report = generate_cgt_report(db, portfolio.id, fy)

        assert report["summary"]["gross_discounted_gains"] == "100.0000"
        assert report["summary"]["total_losses"] == "100.0000"
        assert report["summary"]["net_taxable_position"] == "0.0000"
        assert report["summary"]["carry_forward_loss"] == "0.0000"
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


def test_cgt_report_mixed_loss_offset_order(tmp_path):
    """
    Regression test for Item 5:
    Loss $80, Non-discounted gain $50, Gross discounted gain $200.
    1. Loss $80 offsets $50 non-discounted gain -> remaining non-discounted = $0, remaining loss = $30.
    2. Remaining loss $30 offsets $200 gross discounted gain -> remaining gross discounted = $170.
    3. Apply 50% discount to $170 -> Net taxable = $85. Carry forward loss = $0.
    """
    db_file = tmp_path / "test_cgt2.sqlite3"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        user = User(username="reportuser2", password_hash="hash")
        db.add(user)
        db.flush()

        portfolio = Portfolio(owner_id=user.id, name="Report Portfolio 2")
        db.add(portfolio)
        db.flush()

        inst = Instrument(symbol="VGS.AX", name="Vanguard International Shares")
        db.add(inst)
        db.flush()

        holding = Holding(portfolio_id=portfolio.id, instrument_id=inst.id)
        db.add(holding)
        db.flush()

        fy = 2026

        # Parcel 1 (Discounted gain): Bought 2024-01-01 (held > 12m), 10 units @ $10. Sell 2025-08-01 @ $30 -> Gross gain $200
        b1 = Trade(holding_id=holding.id, type="BUY", trade_date=datetime.date(2024, 1, 1), quantity="10", unit_price="10.00", brokerage="0")
        s1 = Trade(holding_id=holding.id, type="SELL", trade_date=datetime.date(2025, 8, 1), quantity="10", unit_price="30.00", brokerage="0", sell_allocation_method="fifo")

        # Parcel 2 (Non-discounted gain): Bought 2025-08-05 (held < 12m), 10 units @ $10. Sell 2025-09-01 @ $15 -> Non-discounted gain $50
        b2 = Trade(holding_id=holding.id, type="BUY", trade_date=datetime.date(2025, 8, 5), quantity="10", unit_price="10.00", brokerage="0")
        s2 = Trade(holding_id=holding.id, type="SELL", trade_date=datetime.date(2025, 9, 1), quantity="10", unit_price="15.00", brokerage="0", sell_allocation_method="fifo")

        # Parcel 3 (Loss): Bought 2025-09-05, 10 units @ $20. Sell 2025-10-01 @ $12 -> Loss -$80
        b3 = Trade(holding_id=holding.id, type="BUY", trade_date=datetime.date(2025, 9, 5), quantity="10", unit_price="20.00", brokerage="0")
        s3 = Trade(holding_id=holding.id, type="SELL", trade_date=datetime.date(2025, 10, 1), quantity="10", unit_price="12.00", brokerage="0", sell_allocation_method="fifo")

        db.add_all([b1, s1, b2, s2, b3, s3])
        db.flush()

        report = generate_cgt_report(db, portfolio.id, fy)

        assert report["summary"]["gross_discounted_gains"] == "200.0000"
        assert report["summary"]["non_discounted_gains"] == "50.0000"
        assert report["summary"]["total_losses"] == "80.0000"
        assert report["summary"]["net_taxable_position"] == "85.0000"
        assert report["summary"]["carry_forward_loss"] == "0.0000"
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
