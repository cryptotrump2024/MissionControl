import uuid
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, JSON, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "ceo", "researcher"
    status: Mapped[str] = mapped_column(
        String(50), default="offline"
    )  # idle, working, error, paused, offline
    capabilities: Mapped[list] = mapped_column(JSON, default=list)
    model: Mapped[str] = mapped_column(String(100), default="claude-sonnet-4-6")
    config: Mapped[dict] = mapped_column(JSON, default=dict)

    # Hierarchy fields (NEW - not in original plan)
    tier: Mapped[int] = mapped_column(Integer, default=2)  # 0=governance, 1=exec, 2=mgmt, 3=ops
    parent_agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True
    )
    delegation_targets: Mapped[list] = mapped_column(JSON, default=list)
    allowed_tools: Mapped[list] = mapped_column(JSON, default=list)
    model_preference: Mapped[str] = mapped_column(String(100), default="claude-sonnet-4-6")
    token_budget_daily: Mapped[int] = mapped_column(Integer, default=50000)

    # Description
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps and stats
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    last_heartbeat: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    total_tasks: Mapped[int] = mapped_column(Integer, default=0)
    total_cost: Mapped[float] = mapped_column(default=0.0)

    # Relationships
    tasks: Mapped[list["Task"]] = relationship(
        "Task", back_populates="agent", foreign_keys="Task.agent_id"
    )
    logs: Mapped[list["LogEntry"]] = relationship("LogEntry", back_populates="agent")
    cost_records: Mapped[list["CostRecord"]] = relationship(
        "CostRecord", back_populates="agent"
    )
    children: Mapped[list["Agent"]] = relationship(
        "Agent", back_populates="parent", remote_side=[id]
    )
    parent: Mapped["Agent | None"] = relationship(
        "Agent", back_populates="children", remote_side=[parent_agent_id]
    )
