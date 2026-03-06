from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AlertResponse(BaseModel):
    id: UUID
    type: str
    severity: str
    message: str
    agent_id: UUID | None
    task_id: UUID | None
    acknowledged: bool
    created_at: datetime

    model_config = {"from_attributes": True}
