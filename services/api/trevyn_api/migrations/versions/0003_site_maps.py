"""Cache bounded site maps and link plans to the scan used for generation.

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("site_maps",
                    sa.Column("id", sa.String(36), primary_key=True),
                    sa.Column("project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=False),
                    sa.Column("environment_id", sa.String(36), sa.ForeignKey("environments.id"), nullable=False),
                    sa.Column("content", sa.JSON(), nullable=False),
                    sa.Column("crawled_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_site_maps_project_id", "site_maps", ["project_id"])
    op.create_index("ix_site_maps_environment_id", "site_maps", ["environment_id"])
    with op.batch_alter_table("plans") as batch:
        batch.add_column(sa.Column("site_map_id", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_plans_site_map_id_site_maps", "site_maps", ["site_map_id"], ["id"])


def downgrade() -> None:
    with op.batch_alter_table("plans") as batch:
        batch.drop_column("site_map_id")
    op.drop_index("ix_site_maps_environment_id", "site_maps")
    op.drop_index("ix_site_maps_project_id", "site_maps")
    op.drop_table("site_maps")
