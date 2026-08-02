import datetime
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models.models import Instrument, PriceHistory
from app.api.trades import should_backfill

def test_should_backfill_logic(tmp_path):
    """Regression test for Item 7: backfill is skipped when trade_date is >= earliest price."""
    db_file = tmp_path / "test_cb.sqlite3"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        inst = Instrument(symbol="VAS.AX", name="Vanguard VAS")
        db.add(inst)
        db.flush()

        t0 = datetime.date(2025, 1, 1)

        # No prices yet -> should_backfill returns True
        assert should_backfill(db, inst.id, t0) is True

        # Add price on 2025-01-01
        db.add(PriceHistory(instrument_id=inst.id, date=t0, close="85.0000"))
        db.flush()

        # Trade on 2025-01-05 (after 2025-01-01) -> should_backfill returns False!
        t1 = datetime.date(2025, 1, 5)
        assert should_backfill(db, inst.id, t1) is False

        # Trade on 2024-12-01 (before 2025-01-01) -> should_backfill returns True!
        t_early = datetime.date(2024, 12, 1)
        assert should_backfill(db, inst.id, t_early) is True
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
