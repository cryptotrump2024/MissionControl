from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.task import Task
from app.schemas.task import TaskResponse
from app.services.ws_manager import ws_manager

router = APIRouter()


@router.get("", response_model=list[TaskResponse])
async def list_pending_approvals(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """List all tasks awaiting human approval."""
    query = (
        select(Task)
        .where(Task.requires_approval == True)
        .where(Task.approval_status == "pending")
        .offset(skip)
        .limit(limit)
        .order_by(Task.created_at.desc())
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/{task_id}/approve", response_model=TaskResponse)
async def approve_task(
    task_id: UUID,
    approved_by: str = "admin",
    db: AsyncSession = Depends(get_db),
):
    """Approve a task that requires human sign-off."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not task.requires_approval:
        raise HTTPException(status_code=400, detail="Task does not require approval")
    if task.approval_status != "pending":
        raise HTTPException(status_code=400, detail=f"Task already {task.approval_status}")

    task.approval_status = "approved"
    task.approved_by = approved_by
    task.status = "queued"  # Release back to queue for agent execution

    await db.commit()
    await db.refresh(task)

    await ws_manager.broadcast("task_approved", {
        "id": str(task.id),
        "title": task.title,
        "approved_by": approved_by,
    })

    return task


@router.post("/{task_id}/reject", response_model=TaskResponse)
async def reject_task(
    task_id: UUID,
    reason: str = "Rejected by operator",
    rejected_by: str = "admin",
    db: AsyncSession = Depends(get_db),
):
    """Reject a task that requires human sign-off."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not task.requires_approval:
        raise HTTPException(status_code=400, detail="Task does not require approval")

    task.approval_status = "rejected"
    task.approved_by = rejected_by
    task.status = "cancelled"
    task.error_message = reason

    await db.commit()
    await db.refresh(task)

    await ws_manager.broadcast("task_rejected", {
        "id": str(task.id),
        "title": task.title,
        "rejected_by": rejected_by,
        "reason": reason,
    })

    return task
