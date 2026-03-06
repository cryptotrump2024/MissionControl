from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class CostRecordCreate(BaseModel):
    agent_id: UUID | None = None
    task_id: UUID | None = None
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


class CostRecordResponse(BaseModel):
    id: UUID
    agent_id: UUID | None
    task_id: UUID | None
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    timestamp: datetime

    model_config = {"from_attributes": True}


class CostSummary(BaseModel):
    total_cost: float
    total_input_tokens: int
    total_output_tokens: int
    by_agent: dict[str, float]
    by_model: dict[str, float]
    period: str
