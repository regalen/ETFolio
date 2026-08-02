import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator
from decimal import Decimal

class TradeCreateRequest(BaseModel):
    symbol: str  # e.g. "VAS" or "VAS.AX"
    type: Literal["BUY", "SELL"]
    trade_date: datetime.date
    quantity: str
    unit_price: str
    brokerage: str = "0"
    broker: Optional[str] = None
    notes: str = ""
    sell_allocation_method: Optional[Literal["fifo", "lifo", "min_cgt"]] = None

    @field_validator("quantity", "unit_price", "brokerage")

    def validate_decimal_str(cls, v: str) -> str:
        try:
            d = Decimal(v)
            if d < Decimal("0"):
                raise ValueError("Value cannot be negative")
            return str(d)
        except Exception as e:
            raise ValueError(f"Invalid decimal string: {v}")

class TradeUpdateRequest(BaseModel):
    trade_date: Optional[datetime.date] = None
    quantity: Optional[str] = None
    unit_price: Optional[str] = None
    brokerage: Optional[str] = None
    broker: Optional[str] = None
    notes: Optional[str] = None
    sell_allocation_method: Optional[Literal["fifo", "lifo", "min_cgt"]] = None

class TradeResponse(BaseModel):
    id: int
    holding_id: int
    symbol: str
    type: str
    trade_date: datetime.date
    quantity: str
    unit_price: str
    brokerage: str
    broker: Optional[str]
    notes: str
    sell_allocation_method: Optional[str]
    source_distribution_id: Optional[int]
    import_batch_id: Optional[int]
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)
