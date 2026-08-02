import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class InstrumentResponse(BaseModel):
    id: int
    symbol: str
    name: Optional[str]
    exchange: str
    currency: str
    last_price: Optional[str]
    last_price_date: Optional[datetime.date]

    model_config = ConfigDict(from_attributes=True)

class TagResponse(BaseModel):
    id: int
    portfolio_id: int
    name: str

    model_config = ConfigDict(from_attributes=True)

class HoldingUpdateRequest(BaseModel):
    drp_enabled: Optional[bool] = None
    notes: Optional[str] = None
    tag_ids: Optional[List[int]] = None

class HoldingResponse(BaseModel):
    id: int
    portfolio_id: int
    instrument_id: int
    symbol: str
    name: Optional[str]
    drp_enabled: bool
    notes: str
    tag_ids: List[int] = []
    created_at: datetime.datetime

    # Metrics derived from replay & valuation
    quantity: str = "0"
    cost_base: str = "0"
    cost_base_per_share: str = "0"
    average_buy_price: str = "0"
    last_price: Optional[str] = None
    market_value: str = "0"

    model_config = ConfigDict(from_attributes=True)
