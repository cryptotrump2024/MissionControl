# backend/app/routers/templates.py
import uuid as _uuid
from uuid import UUID
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.template import TaskTemplate
from app.models.task import Task

router = APIRouter()


class TemplateCreate(BaseModel):
    name: str
    description: str | None = None
    agent_id: UUID | None = None
    priority: int = 5
    payload: dict[str, Any] | None = None


class TemplateResponse(BaseModel):
    id: UUID
    name: str
    description: str | None
    agent_id: UUID | None
    priority: int
    payload: dict[str, Any] | None
    created_at: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_obj(cls, t: TaskTemplate) -> "TemplateResponse":
        return cls(
            id=t.id,
            name=t.name,
            description=t.description,
            agent_id=t.agent_id,
            priority=t.priority,
            payload=t.payload,
            created_at=t.created_at.isoformat(),
        )


@router.get("", response_model=list[TemplateResponse])
async def list_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TaskTemplate).order_by(TaskTemplate.created_at.desc())
    )
    rows = result.scalars().all()
    return [TemplateResponse.from_orm_obj(r) for r in rows]


@router.post("", response_model=TemplateResponse, status_code=201)
async def create_template(body: TemplateCreate, db: AsyncSession = Depends(get_db)):
    tmpl = TaskTemplate(
        name=body.name,
        description=body.description,
        agent_id=body.agent_id,
        priority=body.priority,
        payload=body.payload,
    )
    db.add(tmpl)
    await db.commit()
    await db.refresh(tmpl)
    return TemplateResponse.from_orm_obj(tmpl)


@router.delete("/{template_id}", status_code=204)
async def delete_template(template_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TaskTemplate).where(TaskTemplate.id == template_id)
    )
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(tmpl)
    await db.commit()


@router.post("/{template_id}/apply", status_code=201)
async def apply_template(template_id: UUID, db: AsyncSession = Depends(get_db)):
    """Create a new Task from this template and return it."""
    result = await db.execute(
        select(TaskTemplate).where(TaskTemplate.id == template_id)
    )
    tmpl = result.scalar_one_or_none()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    task = Task(
        title=tmpl.name,
        description=tmpl.description,
        agent_id=tmpl.agent_id,
        priority=tmpl.priority,
        input_data=tmpl.payload,
        status="queued",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return {"id": str(task.id), "title": task.title, "status": task.status}
