from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import get_settings

settings = get_settings()
security = HTTPBearer(auto_error=False)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expiry_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict | None:
    """Optional auth - returns user dict if authenticated, None otherwise.
    For MVP, auth is optional. Routes can require it explicitly."""
    if credentials is None:
        return None
    return decode_token(credentials.credentials)


async def require_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """Required auth - raises 401 if not authenticated."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return decode_token(credentials.credentials)
