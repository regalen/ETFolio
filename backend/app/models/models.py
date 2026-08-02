import datetime
from sqlalchemy import (
    Column, Integer, String, Boolean, Date, DateTime, ForeignKey,
    UniqueConstraint, CheckConstraint, Text, Table
)
from sqlalchemy.orm import relationship
from app.db import Base

def utc_now():
    return datetime.datetime.now(datetime.UTC).replace(tzinfo=None)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(64), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    portfolios = relationship("Portfolio", back_populates="owner", cascade="all, delete-orphan")
    shares = relationship("PortfolioShare", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    last_seen_at = Column(DateTime, default=utc_now, nullable=False)

    user = relationship("User", back_populates="sessions")


class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    owner = relationship("User", back_populates="portfolios")
    shares = relationship("PortfolioShare", back_populates="portfolio", cascade="all, delete-orphan")
    holdings = relationship("Holding", back_populates="portfolio", cascade="all, delete-orphan")
    tags = relationship("Tag", back_populates="portfolio", cascade="all, delete-orphan")
    import_batches = relationship("ImportBatch", back_populates="portfolio", cascade="all, delete-orphan")


class PortfolioShare(Base):
    __tablename__ = "portfolio_shares"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "user_id", name="uq_portfolio_user"),
        CheckConstraint("permission IN ('view', 'edit')", name="ck_share_permission")
    )

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    permission = Column(String(10), nullable=False)

    portfolio = relationship("Portfolio", back_populates="shares")
    user = relationship("User", back_populates="shares")


class Instrument(Base):
    __tablename__ = "instruments"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=True)
    exchange = Column(String(20), default="ASX", nullable=False)
    currency = Column(String(10), default="AUD", nullable=False)
    last_price = Column(Text, nullable=True)
    last_price_date = Column(Date, nullable=True)

    holdings = relationship("Holding", back_populates="instrument")
    prices = relationship("PriceHistory", back_populates="instrument", cascade="all, delete-orphan")


holding_tags = Table(
    "holding_tags",
    Base.metadata,
    Column("holding_id", Integer, ForeignKey("holdings.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Holding(Base):
    __tablename__ = "holdings"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "instrument_id", name="uq_portfolio_instrument"),
    )

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="RESTRICT"), nullable=False)
    drp_enabled = Column(Boolean, default=False, nullable=False)
    notes = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    portfolio = relationship("Portfolio", back_populates="holdings")
    instrument = relationship("Instrument", back_populates="holdings")
    trades = relationship("Trade", back_populates="holding", cascade="all, delete-orphan")
    distributions = relationship("Distribution", back_populates="holding", cascade="all, delete-orphan")
    tags = relationship("Tag", secondary=holding_tags, back_populates="holdings")


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    imported_at = Column(DateTime, default=utc_now, nullable=False)
    row_count = Column(Integer, nullable=False)

    portfolio = relationship("Portfolio", back_populates="import_batches")
    trades = relationship("Trade", back_populates="import_batch")


class Trade(Base):
    __tablename__ = "trades"
    __table_args__ = (
        CheckConstraint("type IN ('BUY', 'SELL')", name="ck_trade_type"),
        CheckConstraint("sell_allocation_method IS NULL OR sell_allocation_method IN ('fifo', 'lifo', 'min_cgt')", name="ck_trade_allocation"),
    )

    id = Column(Integer, primary_key=True, index=True)
    holding_id = Column(Integer, ForeignKey("holdings.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(10), nullable=False)
    trade_date = Column(Date, nullable=False)
    quantity = Column(Text, nullable=False)
    unit_price = Column(Text, nullable=False)
    brokerage = Column(Text, default="0", nullable=False)
    broker = Column(String(100), nullable=True)
    notes = Column(Text, default="", nullable=False)
    sell_allocation_method = Column(String(20), nullable=True)
    source_distribution_id = Column(Integer, ForeignKey("distributions.id", ondelete="SET NULL"), nullable=True)
    import_batch_id = Column(Integer, ForeignKey("import_batches.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    holding = relationship("Holding", back_populates="trades")
    source_distribution = relationship("Distribution", back_populates="reinvested_trade", foreign_keys=[source_distribution_id])
    import_batch = relationship("ImportBatch", back_populates="trades")


class Distribution(Base):
    __tablename__ = "distributions"

    id = Column(Integer, primary_key=True, index=True)
    holding_id = Column(Integer, ForeignKey("holdings.id", ondelete="CASCADE"), nullable=False)
    pay_date = Column(Date, nullable=False)
    ex_date = Column(Date, nullable=True)
    amount_per_share = Column(Text, nullable=True)
    gross_amount = Column(Text, nullable=False)
    franking_credits = Column(Text, default="0", nullable=False)
    amit_cost_base_increase = Column(Text, default="0", nullable=False)
    amit_cost_base_decrease = Column(Text, default="0", nullable=False)
    net_payment = Column(Text, nullable=False)
    notes = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    holding = relationship("Holding", back_populates="distributions")
    reinvested_trade = relationship("Trade", back_populates="source_distribution", foreign_keys=[Trade.source_distribution_id], uselist=False)


class PriceHistory(Base):
    __tablename__ = "price_history"
    __table_args__ = (
        UniqueConstraint("instrument_id", "date", name="uq_instrument_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    close = Column(Text, nullable=False)

    instrument = relationship("Instrument", back_populates="prices")


class Attachment(Base):
    __tablename__ = "attachments"
    __table_args__ = (
        CheckConstraint("owner_type IN ('trade', 'distribution', 'holding')", name="ck_attachment_owner_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    owner_type = Column(String(20), nullable=False)
    owner_id = Column(Integer, nullable=False)
    filename_original = Column(String(255), nullable=False)
    stored_path = Column(String(255), nullable=False)
    mime_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    uploader = relationship("User")


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "name", name="uq_portfolio_tag_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(50), nullable=False)

    portfolio = relationship("Portfolio", back_populates="tags")
    holdings = relationship("Holding", secondary=holding_tags, back_populates="tags")
