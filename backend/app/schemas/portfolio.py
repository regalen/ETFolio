import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

class PortfolioCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)

class PortfolioUpdateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)

class PortfolioShareCreateRequest(BaseModel):
    username: str
    permission: str = Field(..., pattern=r"^(view|edit)$")

class PortfolioShareResponse(BaseModel):
    id: int
    portfolio_id: int
    user_id: int
    username: str
    permission: str

    model_config = ConfigDict(from_attributes=True)

class PortfolioResponse(BaseModel):
    id: int
    owner_id: int
    name: str
    created_at: datetime.datetime
    permission: str  # 'owner', 'view', or 'edit'

    model_config = ConfigDict(from_attributes=True)
