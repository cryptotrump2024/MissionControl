"""Add app_settings table with seed data.

Revision ID: 002
Revises: 001
Create Date: 2026-03-07
"""

from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    # Seed default values
    op.execute(
        "INSERT INTO app_settings (key, value) VALUES "
        "('daily_budget_usd', '1.00'), "
        "('webhook_url', '')"
    )


def downgrade() -> None:
    op.drop_table("app_settings")
