from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., max_length=100)
    password: str = Field(..., min_length=4)


class UserCreate(BaseModel):
    username: str = Field(..., max_length=100)
    password: str = Field(..., min_length=8)
    role: str = Field(default="viewer", pattern="^(admin|viewer)$")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
