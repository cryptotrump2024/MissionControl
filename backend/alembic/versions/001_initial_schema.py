"""Initial schema — create all 5 tables.

Revision ID: 001
Revises: None
Create Date: 2026-03-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# ---------------------------------------------------------------------------
# Revision identifiers
# ---------------------------------------------------------------------------
revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. agents  (no FK dependencies on other tables, but self-referential)
    # ------------------------------------------------------------------
    op.create_table(
        "agents",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("type", sa.String(100), nullable=False),
        sa.Column("status", sa.String(50), nullable=False, server_default="offline"),
        sa.Column("capabilities", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("model", sa.String(100), nullable=False, server_default="claude-sonnet-4-6"),
        sa.Column("config", sa.JSON(), nullable=False, server_default="{}"),
        # Hierarchy
        sa.Column("tier", sa.Integer(), nullable=False, server_default="2"),
        sa.Column(
            "parent_agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agents.id"),
            nullable=True,
        ),
        sa.Column("delegation_targets", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("allowed_tools", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column(
            "model_preference",
            sa.String(100),
            nullable=False,
            server_default="claude-sonnet-4-6",
        ),
        sa.Column("token_budget_daily", sa.Integer(), nullable=False, server_default="50000"),
        # Description
        sa.Column("description", sa.Text(), nullable=True),
        # Timestamps / stats
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("last_heartbeat", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("total_tasks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "total_cost", sa.Float(), nullable=False, server_default="0.0"
        ),
    )

    # ------------------------------------------------------------------
    # 2. tasks  (FK → agents)
    # ------------------------------------------------------------------
    op.create_table(
        "tasks",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agents.id"),
            nullable=True,
        ),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="queued"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("input_data", sa.JSON(), nullable=True),
        sa.Column("output_data", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        # Cost tracking
        sa.Column("cost", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("tokens_used", sa.Integer(), nullable=False, server_default="0"),
        # Delegation
        sa.Column(
            "delegated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agents.id"),
            nullable=True,
        ),
        sa.Column(
            "delegated_to",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agents.id"),
            nullable=True,
        ),
        sa.Column(
            "parent_task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id"),
            nullable=True,
        ),
        # Human-in-the-loop approval
        sa.Column("requires_approval", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("approval_status", sa.String(50), nullable=True),
        sa.Column("approved_by", sa.String(255), nullable=True),
        # Timestamps
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )

    # ------------------------------------------------------------------
    # 3. log_entries  (FK → agents, tasks)
    # ------------------------------------------------------------------
    op.create_table(
        "log_entries",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id"),
            nullable=True,
        ),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agents.id"),
            nullable=True,
        ),
        sa.Column("level", sa.String(20), nullable=False, server_default="info"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column(
            "timestamp",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # ------------------------------------------------------------------
    # 4. cost_records  (FK → agents, tasks)
    # ------------------------------------------------------------------
    op.create_table(
        "cost_records",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agents.id"),
            nullable=True,
        ),
        sa.Column(
            "task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id"),
            nullable=True,
        ),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column(
            "timestamp",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # ------------------------------------------------------------------
    # 5. alerts  (FK → agents, tasks)
    # ------------------------------------------------------------------
    op.create_table(
        "alerts",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("type", sa.String(100), nullable=False),
        sa.Column("severity", sa.String(50), nullable=False, server_default="warning"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column(
            "agent_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("agents.id"),
            nullable=True,
        ),
        sa.Column(
            "task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tasks.id"),
            nullable=True,
        ),
        sa.Column("acknowledged", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_table("alerts")
    op.drop_table("cost_records")
    op.drop_table("log_entries")
    op.drop_table("tasks")
    op.drop_table("agents")
