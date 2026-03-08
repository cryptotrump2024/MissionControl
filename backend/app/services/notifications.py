# backend/app/services/notifications.py
"""
Shared webhook notification service.
Extracted from alerts.py so tasks can also fire notifications.
"""
import asyncio
import logging
import httpx

logger = logging.getLogger(__name__)

# Strong references to prevent GC of fire-and-forget tasks
_background_tasks: set[asyncio.Task] = set()


async def _deliver(url: str, payload: dict) -> None:
    """Inner delivery — separate function so fire_webhook can be a thin wrapper."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()


async def fire_webhook(payload: dict) -> None:
    """
    Fetch webhook_url from AppSettings and POST payload.
    Fire-and-forget: logs failure, never raises.
    """
    try:
        # Deferred to avoid circular imports at module load time
        from app.database import async_session
        from app.models.setting import AppSetting
        from sqlalchemy import select
        async with async_session() as db:
            result = await db.execute(
                select(AppSetting).where(AppSetting.key == "webhook_url")
            )
            row = result.scalar_one_or_none()
            url = row.value if row else ""
        if not url:
            return
        await _deliver(url, {"source": "MissionControl", **payload})
    except Exception as exc:
        logger.warning("Webhook delivery failed: %s", exc)


def schedule_webhook(payload: dict) -> None:
    """
    Schedule fire_webhook as a background asyncio task.
    Keeps a strong reference so GC cannot collect it.
    """
    task = asyncio.create_task(fire_webhook(payload))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


def schedule_task_event(task_data: dict) -> None:
    """
    Schedule fire_task_event as a background asyncio task.
    Pass a plain dict snapshot (not an ORM instance) to avoid DetachedInstanceError.
    """
    task = asyncio.create_task(fire_task_event(task_data))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def fire_task_event(task_data: dict) -> None:
    """
    Fire webhook for a task status change if notifications are enabled
    and this status is in the configured event list.
    task_data must be a plain dict with keys: id, title, status, agent_id, cost, tokens_used
    """
    try:
        # Deferred to avoid circular imports at module load time
        from app.database import async_session
        from app.models.setting import AppSetting
        from sqlalchemy import select
        async with async_session() as db:
            result = await db.execute(
                select(AppSetting).where(
                    AppSetting.key.in_(["notify_task_events_enabled", "notify_task_events", "webhook_url"])
                )
            )
            rows = {r.key: r.value for r in result.scalars().all()}

        enabled = rows.get("notify_task_events_enabled", "false").lower() == "true"
        if not enabled:
            return
        url = rows.get("webhook_url", "")
        if not url:
            return
        allowed = [s.strip() for s in rows.get("notify_task_events", "completed,failed").split(",")]
        if task_data.get("status") not in allowed:
            return

        payload = {
            "source": "MissionControl",
            "event": f"task.{task_data['status']}",
            "task": task_data,
        }
        await _deliver(url, payload)
    except Exception as exc:
        logger.warning("Task notification delivery failed: %s", exc)
