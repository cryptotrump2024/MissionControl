from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AgentCreate(BaseModel):
    name: str = Field(..., max_length=255)
    type: str = Field(..., max_length=100)
    capabilities: list[str] = Field(default_factory=list)
    model: str = "claude-sonnet-4-6"
    config: dict = Field(default_factory=dict)
    tier: int = Field(default=2, ge=0, le=3)
    parent_agent_id: UUID | None = None
    delegation_targets: list[str] = Field(default_factory=list)
    allowed_tools: list[str] = Field(default_factory=list)
    model_preference: str = "claude-sonnet-4-6"
    token_budget_daily: int = 50000
    description: str | None = None


class AgentUpdate(BaseModel):
    status: str | None = None
    config: dict | None = None
    capabilities: list[str] | None = None
    model_preference: str | None = None
    token_budget_daily: int | None = None


class AgentResponse(BaseModel):
    id: UUID
    name: str
    type: str
    status: str
    capabilities: list[str]
    model: str
    config: dict
    tier: int
    parent_agent_id: UUID | None
    delegation_targets: list[str]
    allowed_tools: list[str]
    model_preference: str
    token_budget_daily: int
    description: str | None
    created_at: datetime
    last_heartbeat: datetime | None
    total_tasks: int
    total_cost: float

    model_config = {"from_attributes": True}


class AgentListResponse(BaseModel):
    agents: list[AgentResponse]
    total: int
