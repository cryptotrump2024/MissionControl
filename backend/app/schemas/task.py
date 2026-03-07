from datetime import datetime, timezone
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class TaskCreate(BaseModel):
    title: str = Field(..., max_length=500)
    description: str | None = None
    agent_id: UUID | None = None
    priority: int = Field(default=5, ge=1, le=10)
    input_data: dict | None = None
    requires_approval: bool = False
    parent_task_id: UUID | None = None
    delegated_by: UUID | None = None
    delegated_to: UUID | None = None
    scheduled_at: datetime | None = None

    @field_validator("scheduled_at", mode="before")
    @classmethod
    def ensure_tz_aware(cls, v: object) -> object:
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v


class TaskUpdate(BaseModel):
    status: str | None = None
    output_data: dict | None = None
    error_message: str | None = None
    cost: float | None = None
    tokens_used: int | None = None
    approval_status: str | None = None
    approved_by: str | None = None


class TaskResponse(BaseModel):
    id: UUID
    agent_id: UUID | None
    title: str
    description: str | None
    status: str
    priority: int
    input_data: dict | None
    output_data: dict | None
    error_message: str | None
    cost: float
    tokens_used: int
    delegated_by: UUID | None
    delegated_to: UUID | None
    parent_task_id: UUID | None
    requires_approval: bool
    approval_status: str | None
    approved_by: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    scheduled_at: datetime | None

    model_config = {"from_attributes": True}


class TaskListResponse(BaseModel):
    tasks: list[TaskResponse]
    total: int
