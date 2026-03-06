import uuid
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, JSON, ForeignKey, Text, Boolean, Float, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="queued"
    )  # queued, running, completed, failed, cancelled, awaiting_approval
    priority: Mapped[int] = mapped_column(Integer, default=5)  # 1=highest, 10=lowest
    input_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Cost tracking
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)

    # Delegation fields (NEW - not in original plan)
    delegated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True
    )
    delegated_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True
    )
    parent_task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True
    )

    # Human-in-the-loop approval (NEW)
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    approval_status: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # pending, approved, rejected
    approved_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    agent: Mapped["Agent | None"] = relationship(
        "Agent", back_populates="tasks", foreign_keys=[agent_id]
    )
    delegator: Mapped["Agent | None"] = relationship(
        "Agent", foreign_keys=[delegated_by]
    )
    delegate: Mapped["Agent | None"] = relationship(
        "Agent", foreign_keys=[delegated_to]
    )
    parent_task: Mapped["Task | None"] = relationship(
        "Task", remote_side=[id], backref="subtasks"
    )
    logs: Mapped[list["LogEntry"]] = relationship("LogEntry", back_populates="task")
    cost_records: Mapped[list["CostRecord"]] = relationship(
        "CostRecord", back_populates="task"
    )
