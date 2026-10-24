"""Verify configured gateway model IDs and structured output without printing credentials.

Run from the repository root: .venv\\Scripts\\python.exe scripts/check_models.py
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

import httpx
from pydantic import BaseModel

for line in (Path(".env").read_text().splitlines() if Path(".env").exists() else []):
    key, sep, value = line.partition("=")
    if sep and not key.strip().startswith("#"):
        os.environ.setdefault(key.strip(), value.strip())

from trevyn_orch.models import OpenAICompatAdapter


class Probe(BaseModel):
    ok: bool


async def main() -> int:
    adapter = OpenAICompatAdapter()
    if not adapter.available:
        print("LLM_API_KEY is empty; add a gateway key to .env before checking models.")
        return 2
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(f"{adapter.base}/models", headers=adapter._headers())
            response.raise_for_status()
            model_ids = {item["id"] for item in response.json().get("data", []) if "id" in item}
            auth = await client.get(f"{adapter.base}/key", headers=adapter._headers()) if "openrouter.ai" in adapter.base else None
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        print(f"Could not list gateway models: {type(exc).__name__}")
        return 1
    if auth is not None and auth.status_code == 401:
        print("OpenRouter rejected LLM_API_KEY (401). The model list is public, so listing it does not verify the key.")
        print("Replace LLM_API_KEY in .env with an OpenRouter API key; do not paste it into chat.")
        return 1
    if auth is not None and auth.status_code >= 400:
        print(f"Could not validate OpenRouter key: HTTP {auth.status_code}")
        return 1
    failed = False
    for node, model in adapter.models.items():
        exists = model in model_ids
        print(f"{node}: {model} — {'found' if exists else 'MISSING'}")
        if not exists:
            family = model.rsplit("/", 1)[-1].split("-")[:2]
            prefix = model.split("/", 1)[0] + "/"
            choices = sorted(mid for mid in model_ids if mid.startswith(prefix) and all(bit in mid for bit in family))
            if choices:
                print("  available similar IDs: " + ", ".join(choices[-8:]))
            failed = True
            continue
        try:
            answer, _ = await adapter.structured(node=node, system="Return a tiny JSON object.", stable=[],
                                                 prompt='Return {"ok": true}.', schema=Probe)
            if not answer.ok:
                raise ValueError("ok was false")
            print("  structured JSON: OK")
        except Exception as exc:  # noqa: BLE001 — gateway adapters have provider-specific exceptions
            detail = str(exc).replace(adapter.key, "[REDACTED]").splitlines()[0][:300]
            print(f"  structured JSON: FAILED ({type(exc).__name__}: {detail})")
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
