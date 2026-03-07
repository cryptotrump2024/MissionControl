"""Add scheduled_at to tasks.

Revision ID: 004
Revises: 003
Create Date: 2026-03-07
"""

from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("scheduled_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tasks", "scheduled_at")
