import datetime
from decimal import Decimal
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.models.models import User, Portfolio, Holding, Instrument, Trade, Distribution

def test_dhhf_reference_dataset(tmp_path):
    db_file = tmp_path / "test_ref.sqlite3"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        user = User(username="refuser", password_hash="hash")
        db.add(user)
        db.flush()

        portfolio = Portfolio(owner_id=user.id, name="Reference Portfolio")
        db.add(portfolio)
        db.flush()

        inst = Instrument(symbol="DHHF.AX", name="BetaShares Diversified All Growth ETF")
        db.add(inst)
        db.flush()

        holding = Holding(portfolio_id=portfolio.id, instrument_id=inst.id)
        db.add(holding)
        db.flush()

        # Enter DHHF trades per §12
        trades_data = [
            ("2025-11-13", "41", "40.55", "3"),
            ("2025-11-13", "1", "40.46", "3"),
            ("2026-01-20", "4", "40.12", "3"),
            ("2026-01-20", "1", "40.11", "3"),
            ("2026-04-20", "4", "39.75", "3"),
            ("2026-07-21", "40", "41.00", "3"),
        ]

        for dt_str, qty, price, fee in trades_data:
            dt = datetime.datetime.strptime(dt_str, "%Y-%m-%d").date()
            t = Trade(
                holding_id=holding.id,
                type="BUY",
                trade_date=dt,
                quantity=qty,
                unit_price=price,
                brokerage=fee
            )
            db.add(t)

        db.flush()

        # Replay CGT to check units and cost base
        from app.services.cgt import validate_holding_stream
        open_parcels, _, _ = validate_holding_stream(db, holding.id)
        total_units = sum((p.qty_remaining for p in open_parcels), Decimal("0"))
        total_cost_base = sum((p.cost_base_remaining for p in open_parcels), Decimal("0"))

        assert total_units == Decimal("91")
        assert total_cost_base == Decimal("3720.60")

        cost_per_share = total_cost_base / total_units
        assert f"{cost_per_share:.3f}" == "40.886"

        # Enter DHHF distributions per §12
        dists_data = [
            ("2026-01-19", "0.304649", "14.02", "1.22", "12.80"),
            ("2026-04-20", "0.142501", "8.76", "2.06", "6.70"),
            ("2026-07-16", "0.21268", "11.74", "0.89", "10.85"),
        ]

        for dt_str, aps, gross, frank, net in dists_data:
            dt = datetime.datetime.strptime(dt_str, "%Y-%m-%d").date()
            d = Distribution(
                holding_id=holding.id,
                pay_date=dt,
                amount_per_share=aps,
                gross_amount=gross,
                franking_credits=frank,
                net_payment=net
            )
            db.add(d)

        db.flush()

        dists = db.query(Distribution).filter(Distribution.holding_id == holding.id).all()
        tot_gross = sum((Decimal(str(d.gross_amount)) for d in dists), Decimal("0"))
        tot_frank = sum((Decimal(str(d.franking_credits)) for d in dists), Decimal("0"))
        tot_net = sum((Decimal(str(d.net_payment)) for d in dists), Decimal("0"))

        assert tot_gross == Decimal("34.52")
        assert tot_frank == Decimal("4.17")
        assert tot_net == Decimal("30.35")

        # Valuation metrics check with price = 41.42 on 2026-07-21
        from app.models.models import PriceHistory
        from app.services.valuation import compute_holding_metrics

        t0 = datetime.date(2025, 11, 13)
        t1 = datetime.date(2026, 7, 21)

        db.add(PriceHistory(instrument_id=inst.id, date=t0, close="40.5500"))
        db.add(PriceHistory(instrument_id=inst.id, date=t1, close="41.4200"))
        db.flush()

        metrics = compute_holding_metrics(db, holding, t0, t1)
        # MV(t1) = 91 * 41.42 = 3769.22
        # Net invested = 3720.60
        # Capital gain = 3769.22 - 0 - 3720.60 = 48.62
        assert metrics["capital_gain"] == "48.6200"
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
