import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CostRecord(Base):
    __tablename__ = "cost_records"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True
    )
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    agent: Mapped["Agent | None"] = relationship("Agent", back_populates="cost_records")
    task: Mapped["Task | None"] = relationship("Task", back_populates="cost_records")
