from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from app.database import get_db
from app.models.agent import Agent
from app.models.task import Task
from app.models.cost_record import CostRecord
from app.models.alert import Alert

router = APIRouter()


@router.get("/stats")
async def dashboard_stats(db: AsyncSession = Depends(get_db)):
    """Aggregated stats for the dashboard — one round trip."""
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Agent counts
    agent_total = (await db.execute(select(func.count(Agent.id)))).scalar()
    agent_active = (await db.execute(
        select(func.count(Agent.id)).where(Agent.status.notin_(["offline"]))
    )).scalar()
    agent_working = (await db.execute(
        select(func.count(Agent.id)).where(Agent.status == "working")
    )).scalar()

    # Task counts
    task_total = (await db.execute(select(func.count(Task.id)))).scalar()
    task_running = (await db.execute(
        select(func.count(Task.id)).where(Task.status == "running")
    )).scalar()
    task_failed = (await db.execute(
        select(func.count(Task.id)).where(Task.status == "failed")
    )).scalar()
    task_completed = (await db.execute(
        select(func.count(Task.id)).where(Task.status == "completed")
    )).scalar()
    task_queued = (await db.execute(
        select(func.count(Task.id)).where(Task.status == "queued")
    )).scalar()

    # Today's cost
    cost_today = float((await db.execute(
        select(func.coalesce(func.sum(CostRecord.cost_usd), 0)).where(
            CostRecord.timestamp >= today
        )
    )).scalar())

    # Unread alerts
    alerts_unread = (await db.execute(
        select(func.count(Alert.id)).where(Alert.acknowledged == False)  # noqa: E712
    )).scalar()

    error_rate = round(task_failed / task_total * 100, 1) if task_total > 0 else 0.0

    return {
        "agents": {
            "total": agent_total,
            "active": agent_active,
            "working": agent_working,
        },
        "tasks": {
            "total": task_total,
            "running": task_running,
            "completed": task_completed,
            "failed": task_failed,
            "queued": task_queued,
            "error_rate": error_rate,
        },
        "costs": {
            "today_usd": cost_today,
        },
        "alerts": {
            "unread": alerts_unread,
        },
    }
