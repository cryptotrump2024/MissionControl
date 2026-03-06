from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class LogEntryCreate(BaseModel):
    task_id: UUID | None = None
    agent_id: UUID | None = None
    level: str = Field(default="info", pattern="^(debug|info|warn|error)$")
    message: str
    metadata: dict | None = None


class LogEntryResponse(BaseModel):
    id: UUID
    task_id: UUID | None
    agent_id: UUID | None
    level: str
    message: str
    metadata_: dict | None = Field(alias="metadata")
    timestamp: datetime

    model_config = {"from_attributes": True, "populate_by_name": True}
