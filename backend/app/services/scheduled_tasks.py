"""Background job that activates tasks whose scheduled_at time has arrived."""
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.services.redis_client import get_redis
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)


async def check_scheduled_tasks(db: AsyncSession) -> int:
    """Find queued tasks whose scheduled_at has passed and activate them.

    Sets status to 'running', pushes to the Redis agent stream, and
    broadcasts a WebSocket event. Returns the number of tasks activated.
    """
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Task)
        .where(Task.status == "queued")
        .where(Task.scheduled_at.isnot(None))
        .where(Task.scheduled_at <= now)
    )
    tasks = result.scalars().all()

    count = 0
    redis_client = get_redis()

    for task in tasks:
        task.status = "running"
        task.started_at = now
        task.scheduled_at = None  # clear to prevent re-trigger

        # Push to the appropriate agent's Redis Stream
        stream_key = f"tasks:{task.delegated_to or 'ceo'}"
        task_payload = json.dumps({
            "id": str(task.id),
            "title": task.title,
            "description": task.description or "",
            "priority": task.priority,
            "input_data": task.input_data or {},
            "agent_id": str(task.agent_id) if task.agent_id else None,
            "delegated_by": str(task.delegated_by) if task.delegated_by else None,
            "delegated_to": str(task.delegated_to) if task.delegated_to else None,
            "parent_task_id": str(task.parent_task_id) if task.parent_task_id else None,
        })
        try:
            await redis_client.xadd(stream_key, {"task": task_payload})
        except Exception as exc:
            logger.error(
                "Failed to push scheduled task %s to stream %s: %s",
                task.id, stream_key, exc, exc_info=True,
            )

        await ws_manager.broadcast("task_updated", {
            "id": str(task.id),
            "title": task.title,
            "status": "running",
        })

        count += 1

    if count:
        await db.commit()
        logger.info("Activated %d scheduled task(s)", count)

    return count
