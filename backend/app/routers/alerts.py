import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
import httpx

from app.database import get_db
from app.models.alert import Alert
from app.schemas.alert import AlertCreate, AlertResponse

router = APIRouter()

logger = logging.getLogger(__name__)


async def _fire_webhook(alert_data: dict) -> None:
    """Fire-and-forget webhook delivery. Logs failure, never raises."""
    try:
        from app.database import async_session
        from app.models.setting import AppSetting
        from sqlalchemy import select as _select
        async with async_session() as db:
            result = await db.execute(
                _select(AppSetting).where(AppSetting.key == "webhook_url")
            )
            row = result.scalar_one_or_none()
            url = row.value if row else ""
        if not url:
            return
        payload = {"event": "alert", "source": "MissionControl", **alert_data}
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(url, json=payload)
    except Exception as exc:
        logger.warning("Webhook delivery failed: %s", exc)


@router.get("", response_model=list[AlertResponse])
async def list_alerts(
    severity: str | None = None,
    acknowledged: bool | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List system alerts with optional filters."""
    query = select(Alert).order_by(Alert.created_at.desc())
    if severity:
        query = query.where(Alert.severity == severity)
    if acknowledged is not None:
        query = query.where(Alert.acknowledged == acknowledged)
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=AlertResponse, status_code=201)
async def create_alert(alert_in: AlertCreate, db: AsyncSession = Depends(get_db)):
    """Create a new alert and fire webhook if configured."""
    alert = Alert(
        type=alert_in.type,
        severity=alert_in.severity,
        message=alert_in.message,
        agent_id=alert_in.agent_id,
        task_id=alert_in.task_id,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    asyncio.create_task(_fire_webhook({
        "alert_id": str(alert.id),
        "type": alert.type,
        "severity": alert.severity,
        "message": alert.message,
    }))
    return alert


@router.patch("/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    alert_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """Mark an alert as acknowledged."""
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.acknowledged = True
    await db.commit()
    await db.refresh(alert)
    return alert


@router.get("/unread-count")
async def unread_alert_count(db: AsyncSession = Depends(get_db)):
    """Count of unacknowledged alerts (for badge display)."""
    result = await db.execute(
        select(func.count(Alert.id)).where(Alert.acknowledged == False)
    )
    return {"count": result.scalar()}
