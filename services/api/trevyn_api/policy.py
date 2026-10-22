"""Policy gate (Part 13.1). Mirrors infra/opa/trevyn.rego; when OPA_URL is set the API asks OPA instead.
Fails closed: any error → deny with reason policy_unavailable."""
from __future__ import annotations

import os
from urllib.parse import urljoin, urlparse

import httpx

VERSION = "py-0.1"
LIMITS = {"load_vus_without_approval": 20}


def host_allowed(host: str, allowed: list[str]) -> bool:
    return any(host == d or (d.startswith("*.") and host.endswith(d[1:])) for d in allowed)


def evaluate(inp: dict) -> dict:
    deny, obligations = [], []
    allowed = inp["project"]["allowed_domains"]
    for h in inp["plan"]["hosts"]:
        if not host_allowed(h, allowed):
            deny.append(f"target {h} is not on the project allowlist")
    if inp["environment"]["is_production"] and inp["plan"]["side_effects"]:
        obligations.append("requires_approval:production")
    if inp["plan"]["high_risk_cases"]:
        obligations.append("requires_approval:high_risk_case")
    return {"allow": not deny, "reasons": deny, "obligations": obligations}


async def decide(inp: dict) -> dict:
    try:
        if url := os.getenv("OPA_URL"):
            async with httpx.AsyncClient(timeout=5) as c:
                r = await c.post(f"{url}/v1/data/trevyn/decision", json={"input": inp})
                return r.json()["result"]
        return evaluate(inp)
    except Exception:
        return {"allow": False, "reasons": ["policy_unavailable"], "obligations": []}


def run_input(project, env, cases: list[dict]) -> dict:
    hosts = {urlparse(env.base_url).hostname}
    for tc in cases:
        for s in tc["steps"]:
            if s["action"] == "goto" and s.get("target"):
                hosts.add(urlparse(urljoin(env.base_url, s["target"])).hostname)
    return {"action": "run.start", "project": {"id": project.id, "allowed_domains": project.allowed_domains},
            "environment": {"name": env.name, "is_production": env.is_production},
            "plan": {"hosts": sorted(h for h in hosts if h), "side_effects": any(tc.get("side_effects") for tc in cases),
                     "high_risk_cases": [tc["test_case_id"] for tc in cases if tc.get("risk") == "high"]}}
