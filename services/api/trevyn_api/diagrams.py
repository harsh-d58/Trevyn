"""Small, bounded diagrams derived from a run's persisted plan, events and evidence."""
from __future__ import annotations

from collections import defaultdict
from urllib.parse import urlparse

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from .common import Problem
from .db import session
from .run_views import _case_id, _json_evidence, _traffic, load_run_bundle

router = APIRouter()
NAMES = {"pipeline", "site-map", "coverage", "journey", "api", "service", "security",
         "evidence", "root-cause", "regression", "repository"}


def _graph(columns: list[list[tuple[str, str, str, str]]], links: list[tuple[str, str]]) -> dict:
    nodes = [{"id": key, "label": label[:45], "sub": sub[:48], "k": kind,
              "x": 120 + col * 260, "y": 48 + row * 80}
             for col, group in enumerate(columns) for row, (key, label, sub, kind) in enumerate(group[:30])]
    ids = {n["id"] for n in nodes}
    edges = [{"from": a, "to": z, "k": "mut"} for a, z in links if a in ids and z in ids]
    return {"nodes": nodes, "edges": edges, "w": max(400, len(columns) * 260),
            "h": max(180, max((len(c[:30]) for c in columns), default=0) * 80 + 30)}


@router.get("/api/runs/{run_id}/diagrams/{name}")
async def diagram(run_id: str, name: str, case: str | None = None, s: AsyncSession = Depends(session)):
    if name not in NAMES:
        raise Problem(404, "not_found", f"Unknown diagram {name}")
    b = await load_run_bundle(s, run_id)
    plan = b["plan"]
    cases = (plan.test_cases or []) if plan else []
    pages = (b["site"].content or {}).get("pages", []) if b["site"] else []
    steps = [e for e in b["evs"] if e.event_type == "step"]
    verdicts = {_case_id(e): e.status for e in b["evs"] if e.event_type == "verdict"}
    if name == "pipeline":
        phases = ["intake", "recon", "gate", "lane_ui", "lane_passive", "verify", "report"]
        status = {(e.data or {}).get("node"): (e.data or {}).get("phase") for e in b["evs"] if e.event_type == "node"}
        nodes = [(p, p.replace("_", " ").title(), status.get(p, "not started"),
                  "bad" if status.get(p) == "failed" else "det" if status.get(p) == "end" else "mut") for p in phases]
        return _graph([nodes[:3], nodes[3:5], nodes[5:]], list(zip(phases, phases[1:])) + [("gate", "lane_passive"), ("lane_ui", "verify")])
    if name == "site-map":
        nodes = [("page:" + p["path"], p.get("title") or p["path"], p["path"], "human" if p.get("fields") else "det") for p in pages if p.get("path")]
        links = [("page:" + p["path"], "page:" + (l.get("path") or urlparse(l.get("href", "")).path))
                 for p in pages if p.get("path") for l in p.get("links", []) if isinstance(l, dict)]
        return _graph([nodes], links)
    if name == "coverage":
        page_nodes = [("page:" + p["path"], p["path"], "site page", "det") for p in pages if p.get("path")]
        case_nodes = [("case:" + c["test_case_id"], c.get("title", c["test_case_id"]),
                       verdicts.get(c["test_case_id"], "not run"), "bad" if verdicts.get(c["test_case_id"]) == "failed" else "det") for c in cases]
        links = [("page:" + str(st.get("target")), "case:" + c["test_case_id"])
                 for c in cases for st in c.get("steps", []) if st.get("action") == "goto"]
        return _graph([page_nodes, case_nodes], links)
    if name == "journey":
        selected = case or (cases[0]["test_case_id"] if cases else None)
        rows = [e for e in steps if _case_id(e) == selected]
        nodes = [(str(e.seq), e.summary, f"{(e.data or {}).get('t_ms', '?')} ms", "bad" if e.status == "failed" else "det") for e in rows]
        return _graph([nodes], [(str(a.seq), str(z.seq)) for a, z in zip(rows, rows[1:])])
    if name in {"api", "service"}:
        traffic = await _traffic(b)
        if case:
            traffic = [row for row in traffic if row.get("case") == case]
        by_page: dict[str, set[str]] = defaultdict(set)
        for r in traffic:
            host = urlparse(str(r.get("url") or "")).hostname or "unknown"
            target = host if name == "service" else str(r.get("path") or "")
            if name == "api" and not target.startswith("/api/"):
                continue
            by_page[str(r.get("case") or "run")].add(target)
        left = [("case:" + c, c, "journey", "det") for c in by_page]
        right = [("target:" + t, t, "host" if name == "service" else "endpoint", "acc")
                 for t in sorted({t for targets in by_page.values() for t in targets})]
        return _graph([left, right], [("case:" + c, "target:" + t) for c, targets in by_page.items() for t in targets])
    if name == "security":
        failed = [f for f in b["findings"] if (f.verdict or {}).get("rule", "").startswith(("passive:", "zap:"))]
        page_nodes = [("page:" + p["path"], p["path"], "entry point", "human" if p.get("fields") else "det") for p in pages if p.get("path")]
        summaries = [await _json_evidence(e) for e in b["evidence"] if e.kind == "passive_summary"]
        cookies = sorted({c for item in summaries if isinstance(item, dict) for c in item.get("cookies", [])})
        cookie_nodes = [("cookie:" + c, c, "cookie name", "human") for c in cookies]
        rules = [("rule:" + f.id, (f.verdict or {}).get("rule", "rule"), f.title, "bad") for f in failed]
        return _graph([page_nodes + cookie_nodes, rules], [(n[0], r[0]) for n in page_nodes + cookie_nodes for r in rules])
    if name == "evidence":
        fs = [("finding:" + f.id, f.display_id, f.title, "bad") for f in b["findings"]]
        es = [("evidence:" + e.id, e.kind, e.test_case_id, "det") for e in b["evidence"]]
        return _graph([fs, es], [("finding:" + f.id, "evidence:" + eid) for f in b["findings"] for eid in f.evidence_ids or []])
    if name == "root-cause":
        fs = [("finding:" + f.id, f.display_id, f.title, "bad") for f in b["findings"]]
        hs = [("hyp:" + f.id + ":" + str(i), h.get("statement", "hypothesis"), h.get("confidence", ""), "ai")
              for f in b["findings"] for i, h in enumerate((f.diagnosis or {}).get("hypotheses", []))]
        evidence = [("evidence:" + e.id, e.kind, e.test_case_id, "det") for e in b["evidence"]]
        links = [("finding:" + f.id, "hyp:" + f.id + ":" + str(i))
                 for f in b["findings"] for i, _ in enumerate((f.diagnosis or {}).get("hypotheses", []))]
        links += [("hyp:" + f.id + ":" + str(i), "evidence:" + eid)
                  for f in b["findings"] for i, h in enumerate((f.diagnosis or {}).get("hypotheses", []))
                  for eid in h.get("supporting_evidence_ids", [])]
        return _graph([fs, hs, evidence], links)
    if name == "regression":
        rows = b["regressions"]
        return _graph([[('before:' + r.id, r.test_case_id, r.baseline_outcome, "bad" if r.baseline_outcome == "failed" else "det") for r in rows],
                       [('after:' + r.id, r.test_case_id, r.rerun_outcome, "bad" if r.rerun_outcome == "failed" else "det") for r in rows]],
                      [("before:" + r.id, "after:" + r.id) for r in rows])
    repo = plan.repository_map or {} if plan else {}
    files = (repo.get("source_files") or []) + (repo.get("test_files") or [])
    folders = sorted({f.split("/", 1)[0] for f in files[:30] if "/" in f})
    return _graph([[('repo', repo.get('repository', 'Repository'), repo.get('commit', ''), 'acc')],
                   [('folder:' + folder, folder, 'folder', 'human') for folder in folders],
                   [('file:' + f, f, 'repository file', 'det') for f in files[:30]]],
                  [('repo', 'folder:' + folder) for folder in folders] +
                  [(('folder:' + f.split('/', 1)[0]) if '/' in f else 'repo', 'file:' + f) for f in files[:30]])
