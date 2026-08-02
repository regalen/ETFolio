import datetime
from pydantic import BaseModel, Field, ConfigDict

class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(..., min_length=8)

class UserLoginRequest(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)
