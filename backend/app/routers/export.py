"""
CSV export endpoints.
GET /api/export/tasks.csv  — export tasks as CSV
GET /api/export/logs.csv   — export log entries as CSV
"""
import csv
import io
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.task import Task
from app.models.log_entry import LogEntry

router = APIRouter()


@router.get("/api/export/tasks.csv")
async def export_tasks(
    status: str | None = Query(None),
    agent_id: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Export tasks as CSV with optional status/agent_id filter."""
    query = select(Task).order_by(Task.created_at.desc())
    if status:
        query = query.where(Task.status == status)
    if agent_id:
        query = query.where(Task.agent_id == UUID(agent_id))

    result = await db.execute(query)
    tasks = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "title", "status", "priority", "agent_id",
        "cost_usd", "tokens_used", "created_at", "completed_at", "error_message",
    ])
    for t in tasks:
        writer.writerow([
            str(t.id),
            t.title,
            t.status,
            t.priority,
            str(t.agent_id) if t.agent_id else "",
            t.cost,
            t.tokens_used,
            t.created_at.isoformat() if t.created_at else "",
            t.completed_at.isoformat() if t.completed_at else "",
            t.error_message or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tasks.csv"},
    )


@router.get("/api/export/logs.csv")
async def export_logs(
    level: str | None = Query(None),
    agent_id: str | None = Query(None),
    task_id: str | None = Query(None),
    limit: int = Query(default=1000, le=5000),
    db: AsyncSession = Depends(get_db),
):
    """Export log entries as CSV with optional filters."""
    query = select(LogEntry).order_by(LogEntry.timestamp.desc()).limit(limit)
    if level:
        query = query.where(LogEntry.level == level)
    if agent_id:
        query = query.where(LogEntry.agent_id == UUID(agent_id))
    if task_id:
        query = query.where(LogEntry.task_id == UUID(task_id))

    result = await db.execute(query)
    logs = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "timestamp", "level", "message", "agent_id", "task_id"])
    for entry in logs:
        writer.writerow([
            str(entry.id),
            entry.timestamp.isoformat() if entry.timestamp else "",
            entry.level,
            entry.message,
            str(entry.agent_id) if entry.agent_id else "",
            str(entry.task_id) if entry.task_id else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=logs.csv"},
    )
