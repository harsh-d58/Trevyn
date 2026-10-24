"""Tests use their own SQLite file, never the dev database."""
import os
from pathlib import Path

Path("var").mkdir(exist_ok=True)
Path("var/test.db").unlink(missing_ok=True)
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///var/test.db"
os.environ.pop("REDIS_URL", None)
