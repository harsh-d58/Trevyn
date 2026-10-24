"""Verified public GitHub repository linked to each project.

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("projects") as batch:
        batch.add_column(sa.Column("repository_url", sa.String(500), nullable=True))
        batch.add_column(sa.Column("repository_ref", sa.String(200), nullable=True))
        batch.add_column(sa.Column("repository_sha", sa.String(40), nullable=True))
        batch.add_column(sa.Column("repository_map", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("repository_checked_at", sa.DateTime(timezone=True), nullable=True))
    with op.batch_alter_table("plans") as batch:
        batch.add_column(sa.Column("repository_sha", sa.String(40), nullable=True))
        batch.add_column(sa.Column("repository_map", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("plans") as batch:
        batch.drop_column("repository_map")
        batch.drop_column("repository_sha")
    with op.batch_alter_table("projects") as batch:
        batch.drop_column("repository_checked_at")
        batch.drop_column("repository_map")
        batch.drop_column("repository_sha")
        batch.drop_column("repository_ref")
        batch.drop_column("repository_url")
