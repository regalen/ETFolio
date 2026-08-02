import datetime
import pytest
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models.models import Instrument, Holding, PriceHistory
from app.services.pricing import append_eod

def test_append_eod_skips_fresh_prices(tmp_path):
    """Regression test for Item 8: append_eod must skip instruments whose price is already current."""
    db_file = tmp_path / "test_sched.sqlite3"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        inst = Instrument(symbol="VAS.AX", name="Vanguard VAS")
        db.add(inst)
        db.flush()

        holding = Holding(portfolio_id=1, instrument_id=inst.id)
        db.add(holding)
        db.flush()

        today = datetime.date.today()
        db.add(PriceHistory(instrument_id=inst.id, date=today, close="85.0000"))
        db.flush()

        with patch("app.services.pricing.backfill_prices") as mock_backfill:
            append_eod(db)
            mock_backfill.assert_not_called()
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
