"""Workspace-wide change feed for live dashboard pages.

Revision ID: 0005
Revises: 0004
"""
import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspace_events",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), primary_key=True, autoincrement=True),
        sa.Column("project_id", sa.String(36), nullable=True),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_workspace_events_project_id", "workspace_events", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_workspace_events_project_id", "workspace_events")
    op.drop_table("workspace_events")
