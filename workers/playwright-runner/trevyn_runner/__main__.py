"""Sandbox entrypoint: `python -m trevyn_runner job.json result.json` (what the Docker launcher will call)."""
import asyncio
import sys
from pathlib import Path

from trevyn_contracts import RunnerJob

from .runner import run_job

job = RunnerJob.model_validate_json(Path(sys.argv[1]).read_text())
result = asyncio.run(run_job(job))
Path(sys.argv[2]).write_text(result.model_dump_json(indent=2))
sys.exit(1 if result.status == "infra_error" else 0)
