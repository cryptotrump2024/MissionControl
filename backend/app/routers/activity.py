# backend/app/routers/activity.py
"""
Activity Feed endpoint.
GET /api/activity?limit=50&before=<iso_timestamp>

Merges recent tasks and alerts into a unified chronological event stream.
No new DB table — queries existing tables.
"""
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.alert import Alert
from app.models.task import Task

router = APIRouter()


def _task_to_event(task: Task) -> dict[str, Any]:
    ts = task.completed_at or task.started_at or task.created_at
    return {
        "id": f"task-{task.id}",
        "type": f"task.{task.status}",
        "title": task.title,
        "timestamp": ts.isoformat() if ts else task.created_at.isoformat(),
        "agent_id": str(task.agent_id) if task.agent_id else None,
        "task_id": str(task.id),
        "alert_id": None,
    }


def _alert_to_event(alert: Alert) -> dict[str, Any]:
    return {
        "id": f"alert-{alert.id}",
        "type": f"alert.{alert.severity}",
        "title": alert.message,
        "timestamp": alert.created_at.isoformat(),
        "agent_id": str(alert.agent_id) if alert.agent_id else None,
        "task_id": str(alert.task_id) if alert.task_id else None,
        "alert_id": str(alert.id),
    }


@router.get("/api/activity")
async def list_activity(
    limit: int = Query(default=50, ge=1, le=200),
    before: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Return a merged, time-sorted list of task and alert events.
    `before` is an ISO timestamp cursor for pagination (returns events older than `before`).
    """
    before_dt: datetime | None = None
    if before:
        try:
            before_dt = datetime.fromisoformat(before.replace("Z", "+00:00"))
        except ValueError:
            before_dt = None

    # Fetch tasks — .where() before .order_by()/.limit()
    task_query = select(Task)
    if before_dt:
        task_query = task_query.where(Task.created_at < before_dt)
    task_query = task_query.order_by(Task.created_at.desc()).limit(limit)
    task_result = await db.execute(task_query)
    tasks = task_result.scalars().all()

    # Fetch alerts — .where() before .order_by()/.limit()
    alert_query = select(Alert)
    if before_dt:
        alert_query = alert_query.where(Alert.created_at < before_dt)
    alert_query = alert_query.order_by(Alert.created_at.desc()).limit(limit)
    alert_result = await db.execute(alert_query)
    alerts = alert_result.scalars().all()

    # Merge and sort descending by timestamp (parse datetime, not string compare)
    events: list[dict[str, Any]] = (
        [_task_to_event(t) for t in tasks]
        + [_alert_to_event(a) for a in alerts]
    )
    events.sort(key=lambda e: datetime.fromisoformat(e["timestamp"]), reverse=True)

    has_more = len(events) > limit
    page = events[:limit]

    return {
        "events": page,
        "has_more": has_more,
    }
