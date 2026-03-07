"""Background job that activates tasks whose scheduled_at time has arrived."""
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task
from app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)


async def check_scheduled_tasks(db: AsyncSession) -> int:
    """Find queued tasks whose scheduled_at has passed and mark them running.

    Returns the number of tasks activated.
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
    for task in tasks:
        task.status = "running"
        task.started_at = now
        task.scheduled_at = None
        count += 1
        await ws_manager.broadcast("task_update", {
            "id": str(task.id),
            "title": task.title,
            "status": "running",
        })

    if count:
        await db.commit()
        logger.info("Activated %d scheduled task(s)", count)

    return count
