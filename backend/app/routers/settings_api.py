# backend/app/routers/settings_api.py
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.database import get_db
from app.models.setting import AppSetting

router = APIRouter()

ALLOWED_KEYS = {"daily_budget_usd", "webhook_url"}
_HTTPS_RE = re.compile(r"^https://\S+$")


def _validate_value(key: str, value: str) -> str:
    """Validate and normalize a setting value. Raises ValueError on bad input."""
    if key == "daily_budget_usd":
        try:
            v = float(value)
        except ValueError:
            raise ValueError("daily_budget_usd must be a number")
        if not (0.01 <= v <= 100.0):
            raise ValueError("daily_budget_usd must be between 0.01 and 100.00")
        return f"{v:.2f}"
    if key == "webhook_url":
        value = value.strip()
        if value and not _HTTPS_RE.match(value):
            raise ValueError("webhook_url must be empty or start with https://")
        return value
    return value


@router.get("")
async def get_settings(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Return all app settings as {key: value}."""
    result = await db.execute(select(AppSetting))
    rows = result.scalars().all()
    return {row.key: row.value for row in rows}


@router.put("/{key}")
async def update_setting(
    key: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Update a single setting by key. Body: {"value": "..."}"""
    if key not in ALLOWED_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown setting key: {key}")
    raw_value = payload.get("value", "")
    try:
        value = _validate_value(key, str(raw_value))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting is None:
        setting = AppSetting(key=key, value=value)
        db.add(setting)
    else:
        setting.value = value
    await db.commit()
    return {"key": key, "value": value}


@router.post("/test-webhook")
async def test_webhook(db: AsyncSession = Depends(get_db)) -> dict:
    """Fire a test POST to the configured webhook URL."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.key == "webhook_url")
    )
    row = result.scalar_one_or_none()
    url = row.value if row else ""
    if not url:
        raise HTTPException(status_code=400, detail="No webhook URL configured")
    payload = {
        "event": "test",
        "source": "MissionControl",
        "message": "Webhook test from MissionControl Settings",
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(url, json=payload)
        return {"status": "ok", "http_status": r.status_code}
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Webhook delivery failed: {exc}")
