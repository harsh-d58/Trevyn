"""Display IDs (RUN-2481, DEF-142, AP-1, RP-1) become unique across the workspace.

They used to be numbered per project, so a second project reused RUN-2481 and DEF-142. The oldest row keeps its ID;
later duplicates get the next free number for their prefix, and run-event summaries that mention a renumbered
finding are left as written (they are an append-only log).

Revision ID: 0006
Revises: 0005
"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

TABLES = {"runs": ("RUN", "started_at"), "findings": ("DEF", "created_at"), "approvals": ("AP", "created_at"),
          "repairs": ("RP", "created_at")}


def _num(display_id: str) -> int:
    tail = display_id.rsplit("-", 1)[-1]
    return int(tail) if tail.isdigit() else 0


def upgrade() -> None:
    conn = op.get_bind()
    for table, (prefix, ts) in TABLES.items():
        rows = conn.execute(sa.text(f"SELECT id, display_id FROM {table} ORDER BY {ts}, id")).all()
        top = max((_num(d) for _, d in rows), default=0)
        seen: set[str] = set()
        for row_id, display_id in rows:
            if display_id in seen:
                top += 1
                new = f"{prefix}-{top:04d}" if prefix == "RUN" else f"{prefix}-{top}"
                conn.execute(sa.text(f"UPDATE {table} SET display_id = :d WHERE id = :i"), {"d": new, "i": row_id})
                display_id = new
            seen.add(display_id)
        op.create_index(f"uq_{table}_display_id", table, ["display_id"], unique=True)


def downgrade() -> None:
    for table in TABLES:
        op.drop_index(f"uq_{table}_display_id", table)
