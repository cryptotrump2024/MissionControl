import json
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.task import Task
from app.models.agent import Agent
from app.schemas.task import TaskCreate, TaskUpdate, TaskResponse, TaskListResponse
from app.services.redis_client import get_redis
from app.services.ws_manager import ws_manager
from app.services.notifications import schedule_task_event

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(task_in: TaskCreate, db: AsyncSession = Depends(get_db)):
    """Create a new task, optionally assigning it to an agent."""
    task = Task(
        title=task_in.title,
        description=task_in.description,
        agent_id=task_in.agent_id,
        priority=task_in.priority,
        input_data=task_in.input_data,
        requires_approval=task_in.requires_approval,
        parent_task_id=task_in.parent_task_id,
        delegated_by=task_in.delegated_by,
        delegated_to=task_in.delegated_to,
        status="queued",
        scheduled_at=task_in.scheduled_at,
    )

    if task_in.requires_approval:
        task.approval_status = "pending"

    db.add(task)
    await db.commit()
    await db.refresh(task)

    # Update agent task count
    if task.agent_id:
        result = await db.execute(select(Agent).where(Agent.id == task.agent_id))
        agent = result.scalar_one_or_none()
        if agent:
            agent.total_tasks += 1
            await db.commit()

    await ws_manager.broadcast("task_created", {
        "id": str(task.id),
        "title": task.title,
        "status": task.status,
        "agent_id": str(task.agent_id) if task.agent_id else None,
        "priority": task.priority,
    })

    # Skip Redis push for tasks scheduled in the future
    now_utc = datetime.now(timezone.utc)
    is_future = task_in.scheduled_at is not None and task_in.scheduled_at > now_utc
    if not is_future:
        # Push to Redis Stream so the appropriate agent picks it up
        stream_key = f"tasks:{task.delegated_to or 'ceo'}"
        task_payload = json.dumps({
            "id": str(task.id),
            "title": task.title,
            "description": task.description or "",
            "priority": task.priority,
            "input_data": task.input_data or {},
            "agent_id": str(task.agent_id) if task.agent_id else None,
            "delegated_by": task.delegated_by,
            "delegated_to": task.delegated_to,
            "parent_task_id": str(task.parent_task_id) if task.parent_task_id else None,
        })
        redis_client = get_redis()
        try:
            await redis_client.xadd(stream_key, {"task": task_payload})
            logger.info("Task queued on stream %s", stream_key)
        except Exception as exc:
            logger.error(
                "Failed to queue task %s on stream %s: %s",
                task.id, stream_key, exc, exc_info=True,
            )

    return task


@router.get("", response_model=TaskListResponse)
async def list_tasks(
    status: str | None = None,
    agent_id: UUID | None = None,
    priority: int | None = None,
    parent_task_id: UUID | None = None,
    search: str | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List tasks with filtering and pagination."""
    query = select(Task)
    count_query = select(func.count(Task.id))

    if status:
        query = query.where(Task.status == status)
        count_query = count_query.where(Task.status == status)
    if agent_id:
        query = query.where(Task.agent_id == agent_id)
        count_query = count_query.where(Task.agent_id == agent_id)
    if priority:
        query = query.where(Task.priority == priority)
        count_query = count_query.where(Task.priority == priority)
    if parent_task_id:
        query = query.where(Task.parent_task_id == parent_task_id)
        count_query = count_query.where(Task.parent_task_id == parent_task_id)
    if search:
        query = query.where(Task.title.ilike(f"%{search}%"))
        count_query = count_query.where(Task.title.ilike(f"%{search}%"))

    query = query.offset(skip).limit(limit).order_by(Task.created_at.desc())
    result = await db.execute(query)
    tasks = result.scalars().all()

    total_result = await db.execute(count_query)
    total = total_result.scalar()

    return TaskListResponse(tasks=tasks, total=total)


class _BulkAction(BaseModel):
    action: str
    task_ids: list[UUID]
    agent_id: UUID | None = None


@router.post("/bulk")
async def bulk_task_action(body: _BulkAction, db: AsyncSession = Depends(get_db)):
    """Bulk cancel or reassign tasks. action: cancel or reassign. Max 100 task_ids."""
    if body.action not in ("cancel", "reassign"):
        raise HTTPException(status_code=422, detail="action must be cancel or reassign")
    if not 1 <= len(body.task_ids) <= 100:
        raise HTTPException(status_code=422, detail="task_ids must contain 1-100 items")
    if body.action == "reassign" and not body.agent_id:
        raise HTTPException(status_code=422, detail="agent_id required for reassign")
    if body.action == "reassign" and body.agent_id:
        agent_check = await db.execute(select(Agent.id).where(Agent.id == body.agent_id))
        if not agent_check.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Agent not found")

    result = await db.execute(select(Task).where(Task.id.in_(body.task_ids)))
    db_tasks = result.scalars().all()

    updated = 0
    skipped = len(body.task_ids) - len(db_tasks)
    now = datetime.now(timezone.utc)

    for task in db_tasks:
        if body.action == "cancel":
            if task.status in ("queued", "running"):
                task.status = "cancelled"
                task.completed_at = now
                updated += 1
            else:
                skipped += 1
        elif body.action == "reassign":
            task.agent_id = body.agent_id
            updated += 1

    await db.commit()
    return {"updated": updated, "skipped": skipped}


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get full details for a single task."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/{task_id}/logs")
async def get_task_logs(
    task_id: UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Get all log entries for a specific task."""
    from app.models.log_entry import LogEntry
    from app.schemas.log_entry import LogEntryResponse
    query = (
        select(LogEntry)
        .where(LogEntry.task_id == task_id)
        .order_by(LogEntry.timestamp.asc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: UUID,
    update: TaskUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a task's status, output, or other fields."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = update.model_dump(exclude_unset=True)
    old_status = task.status

    for field, value in update_data.items():
        setattr(task, field, value)

    # Set timestamps based on status transitions
    if "status" in update_data:
        if update_data["status"] == "running" and not task.started_at:
            task.started_at = datetime.now(timezone.utc)
        elif update_data["status"] in ("completed", "failed", "cancelled"):
            task.completed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(task)

    # Fire notification for terminal status changes
    if "status" in update_data and update_data["status"] in ("completed", "failed", "cancelled"):
        schedule_task_event(task)

    # Broadcast appropriate event
    if "status" in update_data:
        event_type = {
            "completed": "task_completed",
            "failed": "task_failed",
        }.get(update_data["status"], "task_updated")

        await ws_manager.broadcast(event_type, {
            "id": str(task.id),
            "title": task.title,
            "status": task.status,
            "old_status": old_status,
            "agent_id": str(task.agent_id) if task.agent_id else None,
        })

    return task
