import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Text, JSON, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LogEntry(Base):
    __tablename__ = "log_entries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=True
    )
    agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id"), nullable=True
    )
    level: Mapped[str] = mapped_column(String(20), default="info")  # debug, info, warn, error
    message: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    task: Mapped["Task | None"] = relationship("Task", back_populates="logs")
    agent: Mapped["Agent | None"] = relationship("Agent", back_populates="logs")
