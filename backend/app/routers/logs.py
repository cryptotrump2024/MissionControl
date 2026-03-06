from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.log_entry import LogEntry
from app.schemas.log_entry import LogEntryCreate, LogEntryResponse
from app.services.ws_manager import ws_manager

router = APIRouter()


@router.post("", response_model=LogEntryResponse, status_code=201)
async def create_log(log_in: LogEntryCreate, db: AsyncSession = Depends(get_db)):
    """Create a new log entry."""
    log = LogEntry(
        task_id=log_in.task_id,
        agent_id=log_in.agent_id,
        level=log_in.level,
        message=log_in.message,
        metadata_=log_in.metadata,
    )
    db.add(log)
    await db.commit()
    await db.refresh(log)

    await ws_manager.broadcast("log_entry", {
        "id": str(log.id),
        "level": log.level,
        "message": log.message,
        "agent_id": str(log.agent_id) if log.agent_id else None,
        "task_id": str(log.task_id) if log.task_id else None,
        "timestamp": log.timestamp.isoformat(),
    })

    return log


@router.get("", response_model=list[LogEntryResponse])
async def list_logs(
    agent_id: UUID | None = None,
    task_id: UUID | None = None,
    level: str | None = None,
    search: str | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """List log entries with filtering."""
    query = select(LogEntry)

    if agent_id:
        query = query.where(LogEntry.agent_id == agent_id)
    if task_id:
        query = query.where(LogEntry.task_id == task_id)
    if level:
        query = query.where(LogEntry.level == level)
    if search:
        query = query.where(LogEntry.message.ilike(f"%{search}%"))

    query = query.offset(skip).limit(limit).order_by(LogEntry.timestamp.desc())
    result = await db.execute(query)
    logs = result.scalars().all()

    return logs
