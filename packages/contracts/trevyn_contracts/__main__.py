"""Export JSON Schemas: `uv run python -m trevyn_contracts`."""
import json
from pathlib import Path

from . import Diagnosis, PageMap, PlanDraft, RunnerJob, RunnerResult, SiteMap, TestCase, Verdict

out = Path(__file__).resolve().parents[3] / "schemas"
out.mkdir(exist_ok=True)
for name, model in {"test-plan": PlanDraft, "test-case": TestCase, "runner-job": RunnerJob,
                    "runner-result": RunnerResult, "verdict": Verdict, "diagnosis": Diagnosis,
                    "page-map": PageMap, "site-map": SiteMap}.items():
    (out / f"{name}.schema.json").write_text(json.dumps(model.model_json_schema(), indent=2))
    print("wrote", name)
