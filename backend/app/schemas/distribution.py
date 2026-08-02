import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator
from decimal import Decimal

class ReinvestmentPayload(BaseModel):
    units: str
    price: str

    @field_validator("units", "price")
    def validate_decimal_str(cls, v: str) -> str:
        d = Decimal(v)
        if d <= Decimal("0"):
            raise ValueError("Reinvestment units and price must be positive")
        return str(d)

class DistributionCreateRequest(BaseModel):
    pay_date: datetime.date
    ex_date: Optional[datetime.date] = None
    amount_per_share: Optional[str] = None
    gross_amount: Optional[str] = None
    franking_credits: str = "0"
    amit_cost_base_increase: str = "0"
    amit_cost_base_decrease: str = "0"
    net_payment: Optional[str] = None
    notes: str = ""
    reinvestment: Optional[ReinvestmentPayload] = None

class DistributionUpdateRequest(BaseModel):
    pay_date: Optional[datetime.date] = None
    ex_date: Optional[datetime.date] = None
    amount_per_share: Optional[str] = None
    gross_amount: Optional[str] = None
    franking_credits: Optional[str] = None
    amit_cost_base_increase: Optional[str] = None
    amit_cost_base_decrease: Optional[str] = None
    net_payment: Optional[str] = None
    notes: Optional[str] = None
    reinvestment: Optional[ReinvestmentPayload] = None

class DistributionResponse(BaseModel):
    id: int
    holding_id: int
    pay_date: datetime.date
    ex_date: Optional[datetime.date]
    amount_per_share: Optional[str]
    gross_amount: str
    franking_credits: str
    amit_cost_base_increase: str
    amit_cost_base_decrease: str
    net_payment: str
    notes: str
    reinvested_trade_id: Optional[int] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)
