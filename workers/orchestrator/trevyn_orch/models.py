"""Provider-agnostic model adapter (Part 8.3/8.4). Anthropic is the default implementation.
The LLM proposes; deterministic code decides. Every call returns usage for the model_calls table."""
from __future__ import annotations

import os
import time
from collections.abc import AsyncIterator
from typing import TypeVar

import anthropic
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

ROUTING = {
    "planner": os.getenv("MODEL_PLANNER", "claude-opus-5-5"),
    "diagnostician": os.getenv("MODEL_DIAGNOSTICIAN", "claude-opus-5-5"),
    "fix": os.getenv("MODEL_FIX", "claude-opus-5-5"),
    "assistant": os.getenv("MODEL_ASSISTANT", "claude-opus-5-5"),
}
PRICES = {"claude-opus-5-5": (4.0, 20.0), "claude-sonnet-5-5": (2.0, 10.0), "claude-haiku-5-5": (0.10, 0.50)}  # $/MTok, 2026-10


class ModelUnavailable(Exception):
    pass


class ModelRefused(Exception):
    pass


class Usage(BaseModel):
    node: str
    provider: str = "anthropic"
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    latency_ms: int = 0
    stop_reason: str | None = None
    cost_usd: float = 0.0


def _usage(node: str, model: str, msg, t0: float) -> Usage:
    u = msg.usage
    pin, pout = PRICES.get(model, (0, 0))
    cost = (u.input_tokens * pin + u.output_tokens * pout + (u.cache_read_input_tokens or 0) * pin * 0.1
            + (u.cache_creation_input_tokens or 0) * pin * 1.25) / 1e6
    return Usage(node=node, model=model, input_tokens=u.input_tokens, output_tokens=u.output_tokens,
                 cache_read_tokens=u.cache_read_input_tokens or 0, cache_write_tokens=u.cache_creation_input_tokens or 0,
                 latency_ms=int((time.monotonic() - t0) * 1000), stop_reason=msg.stop_reason, cost_usd=round(cost, 5))


def observed(source: str, text: str) -> str:
    """Wrap untrusted app/repo content (Part 8.6). Closing tags inside are escaped."""
    return f'<observed_content source="{source}">\n{text.replace("</observed_content", "&lt;/observed_content")}\n</observed_content>'


class AnthropicAdapter:
    def __init__(self) -> None:
        has_creds = os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")
        self.client = anthropic.AsyncAnthropic(max_retries=3) if has_creds else None

    @property
    def available(self) -> bool:
        return self.client is not None

    @staticmethod
    def _system(system: str, stable: list[str]) -> list[dict]:
        blocks = [{"type": "text", "text": system}] + [{"type": "text", "text": s} for s in stable]
        blocks[-1]["cache_control"] = {"type": "ephemeral"}  # stable prefix cached; volatile context goes in messages
        return blocks

    async def structured(self, *, node: str, system: str, stable: list[str], prompt: str, schema: type[T],
                         effort: str = "high") -> tuple[T, Usage]:
        if not self.client:
            raise ModelUnavailable("no Anthropic credentials")
        model, t0 = ROUTING[node], time.monotonic()
        try:
            resp = await self.client.messages.parse(
                model=model, max_tokens=16000, thinking={"type": "adaptive"}, output_config={"effort": effort},
                system=self._system(system, stable), messages=[{"role": "user", "content": prompt}], output_format=schema)
        except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.APIStatusError) as e:
            raise ModelUnavailable(f"{type(e).__name__}: {e}") from e
        if resp.stop_reason == "refusal":
            raise ModelRefused(str(getattr(resp, "stop_details", "")))
        if resp.stop_reason == "max_tokens" or resp.parsed_output is None:
            raise ModelUnavailable("output truncated or unparsable")
        return resp.parsed_output, _usage(node, model, resp, t0)

    async def stream_text(self, *, node: str, system: str, stable: list[str], messages: list[dict],
                          effort: str = "medium", usage_out: list | None = None) -> AsyncIterator[str]:
        """Streams text. Server-side refusal fallbacks are on (beta server-side-fallback-2026-07-01, fallbacks="default")."""
        if not self.client:
            raise ModelUnavailable("no Anthropic credentials")
        model, t0 = ROUTING[node], time.monotonic()
        async with self.client.beta.messages.stream(
            model=model, max_tokens=64000, thinking={"type": "adaptive"}, output_config={"effort": effort},
            betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            system=self._system(system, stable), messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text
            msg = await stream.get_final_message()
        if usage_out is not None:
            usage_out.append(_usage(node, model, msg, t0))
        if msg.stop_reason == "refusal":
            yield "\n\n[The model declined this request.]"

    async def text(self, **kw) -> tuple[str, Usage]:
        usage: list[Usage] = []
        out = "".join([t async for t in self.stream_text(usage_out=usage, **kw)])
        return out, usage[0]


GEMINI_DEFAULT = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_PRICES = {"gemini-2.5-flash": (0.30, 2.50), "gemini-2.5-flash-lite": (0.10, 0.40)}  # $/MTok, approximate; check Google's pricing page


class GeminiAdapter:
    """Same interface as AnthropicAdapter, backed by Google's `google-genai` SDK (`uv add google-genai`).
    Selected when MODEL_PROVIDER=gemini, or when GEMINI_API_KEY is set and MODEL_PROVIDER is unset."""

    def __init__(self) -> None:
        self.key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self._client = None

    @property
    def available(self) -> bool:
        return bool(self.key)

    def client(self):
        if not self.key:
            raise ModelUnavailable("no Gemini API key")
        if self._client is None:
            try:
                from google import genai
            except ImportError as e:
                raise ModelUnavailable("google-genai is not installed: run `uv add google-genai`") from e
            self._client = genai.Client(api_key=self.key)
        return self._client

    @staticmethod
    def _model(node: str) -> str:
        m = ROUTING[node]
        return m if m.startswith("gemini") else GEMINI_DEFAULT

    @staticmethod
    def _usage(node: str, model: str, resp, t0: float) -> Usage:
        u = getattr(resp, "usage_metadata", None)
        i, o = (getattr(u, "prompt_token_count", 0) or 0), (getattr(u, "candidates_token_count", 0) or 0)
        cached = getattr(u, "cached_content_token_count", 0) or 0
        pin, pout = GEMINI_PRICES.get(model, (0, 0))
        return Usage(node=node, provider="google", model=model, input_tokens=i, output_tokens=o, cache_read_tokens=cached,
                     latency_ms=int((time.monotonic() - t0) * 1000), cost_usd=round((i * pin + o * pout) / 1e6, 5),
                     stop_reason=str(getattr((resp.candidates or [None])[0], "finish_reason", "") or "") if getattr(resp, "candidates", None) else None)

    async def structured(self, *, node: str, system: str, stable: list[str], prompt: str, schema: type[T],
                         effort: str = "high") -> tuple[T, Usage]:
        from pydantic import ValidationError
        client, model, t0 = self.client(), self._model(node), time.monotonic()
        from google.genai import types
        instruction = "\n\n".join([system, *stable])
        # JSON Schema straight from Pydantic (handles unions); the reply is validated again below
        cfg = types.GenerateContentConfig(system_instruction=instruction, response_mime_type="application/json",
                                          response_json_schema=schema.model_json_schema())
        try:
            resp = await client.aio.models.generate_content(model=model, contents=prompt, config=cfg)
        except Exception as e:  # SDK raises its own error types; any failure falls back to the deterministic path
            raise ModelUnavailable(f"{type(e).__name__}: {e}") from e
        try:
            return schema.model_validate_json(resp.text or ""), self._usage(node, model, resp, t0)
        except ValidationError as e:
            raise ModelUnavailable(f"Gemini reply did not match the schema: {e.error_count()} errors") from e

    async def stream_text(self, *, node: str, system: str, stable: list[str], messages: list[dict],
                          effort: str = "medium", usage_out: list | None = None) -> AsyncIterator[str]:
        client, model, t0 = self.client(), self._model(node), time.monotonic()
        from google.genai import types
        contents = [types.Content(role="model" if m["role"] == "assistant" else "user", parts=[types.Part(text=m["content"])])
                    for m in messages if isinstance(m.get("content"), str)]
        cfg = types.GenerateContentConfig(system_instruction="\n\n".join([system, *stable]))
        last = None
        try:
            async for chunk in await client.aio.models.generate_content_stream(model=model, contents=contents, config=cfg):
                last = chunk
                if chunk.text:
                    yield chunk.text
        except Exception as e:
            raise ModelUnavailable(f"{type(e).__name__}: {e}") from e
        if usage_out is not None and last is not None:
            usage_out.append(self._usage(node, model, last, t0))

    async def text(self, **kw) -> tuple[str, Usage]:
        usage: list[Usage] = []
        out = "".join([t async for t in self.stream_text(usage_out=usage, **kw)])
        return out, usage[0] if usage else Usage(node=kw["node"], provider="google", model=self._model(kw["node"]))


GATEWAYS = {"openrouter": "https://openrouter.ai/api/v1", "fastrouter": "https://go.fastrouter.ai/api/v1"}


class OpenAICompatAdapter:
    """Any OpenAI-compatible gateway (OpenRouter, Together, Groq, a local server…): one key, many models.
    MODEL_PROVIDER=openrouter|fastrouter|openai_compat, LLM_API_KEY, LLM_BASE_URL, and one model per node (LLM_MODEL_PLANNER, …).
    Plain httpx, no SDK. Model output is validated against the Pydantic schema; a bad reply falls back to rules."""

    NODES = ("planner", "diagnostician", "fix", "assistant")

    def __init__(self) -> None:
        self.key = os.getenv("LLM_API_KEY", "")
        default_base = GATEWAYS.get(os.getenv("MODEL_PROVIDER", "").lower(), GATEWAYS["openrouter"])
        self.base = (os.getenv("LLM_BASE_URL") or default_base).rstrip("/")
        default = os.getenv("LLM_MODEL", "google/gemini-2.5-flash")
        self.models = {n: os.getenv(f"LLM_MODEL_{n.upper()}", default) for n in self.NODES}
        # Gateways reserve credit for the longest possible reply; without a cap a low balance refuses big models (402)
        self.max_tokens = {n: int(os.getenv(f"LLM_MAX_TOKENS_{n.upper()}", d)) for n, d in
                           (("planner", 6000), ("diagnostician", 2500), ("fix", 2000), ("assistant", 2000))}

    @property
    def available(self) -> bool:
        return bool(self.key)

    def _headers(self) -> dict:
        if not self.key:
            raise ModelUnavailable("no LLM_API_KEY")
        return {"Authorization": f"Bearer {self.key}", "HTTP-Referer": "https://github.com/harshgitty58/Trevyn", "X-Title": "Trevyn"}

    def _usage(self, node: str, model: str, data: dict, t0: float) -> Usage:
        u = data.get("usage") or {}
        return Usage(node=node, provider="openai_compat", model=model, input_tokens=u.get("prompt_tokens", 0) or 0,
                     output_tokens=u.get("completion_tokens", 0) or 0, latency_ms=int((time.monotonic() - t0) * 1000),
                     cost_usd=round(float(u.get("cost", 0) or 0), 5))

    async def structured(self, *, node: str, system: str, stable: list[str], prompt: str, schema: type[T],
                         effort: str = "high") -> tuple[T, Usage]:
        import json

        import httpx
        from pydantic import ValidationError
        model, t0 = self.models[node], time.monotonic()
        js = schema.model_json_schema()
        messages = [{"role": "system", "content": "\n\n".join([system, *stable, "Reply with JSON only, matching this JSON Schema:\n" + json.dumps(js)])},
                    {"role": "user", "content": prompt}]
        body = {"model": model, "messages": messages, "max_tokens": self.max_tokens[node],
                "response_format": {"type": "json_schema", "json_schema": {"name": schema.__name__, "schema": js}}}
        try:
            async with httpx.AsyncClient(timeout=180) as c:
                r = await c.post(f"{self.base}/chat/completions", json=body, headers=self._headers())
                if r.status_code == 400:  # model without schema support: plain JSON mode
                    body["response_format"] = {"type": "json_object"}
                    r = await c.post(f"{self.base}/chat/completions", json=body, headers=self._headers())
                r.raise_for_status()
                data = r.json()
        except httpx.HTTPError as e:
            raise ModelUnavailable(f"{type(e).__name__}: {e}") from e
        text = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
        text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        try:
            return schema.model_validate_json(text), self._usage(node, model, data, t0)
        except ValidationError as e:
            raise ModelUnavailable(f"{model} reply did not match the schema: {e.error_count()} errors") from e

    async def stream_text(self, *, node: str, system: str, stable: list[str], messages: list[dict],
                          effort: str = "medium", usage_out: list | None = None) -> AsyncIterator[str]:
        import json

        import httpx
        model, t0, last = self.models[node], time.monotonic(), {}
        body = {"model": model, "stream": True, "stream_options": {"include_usage": True}, "max_tokens": self.max_tokens[node],
                "messages": [{"role": "system", "content": "\n\n".join([system, *stable])}] + [m for m in messages if isinstance(m.get("content"), str)]}
        try:
            async with httpx.AsyncClient(timeout=180) as c, c.stream("POST", f"{self.base}/chat/completions", json=body, headers=self._headers()) as r:
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if not line.startswith("data: ") or line == "data: [DONE]":
                        continue
                    chunk = json.loads(line[6:])
                    last = chunk if chunk.get("usage") else last
                    for ch in chunk.get("choices") or []:
                        if t := (ch.get("delta") or {}).get("content"):
                            yield t
        except httpx.HTTPError as e:
            raise ModelUnavailable(f"{type(e).__name__}: {e}") from e
        if usage_out is not None:
            usage_out.append(self._usage(node, model, last, t0))

    async def text(self, **kw) -> tuple[str, Usage]:
        usage: list[Usage] = []
        out = "".join([t async for t in self.stream_text(usage_out=usage, **kw)])
        return out, usage[0] if usage else Usage(node=kw["node"], provider="openai_compat", model=self.models[kw["node"]])


def _pick():
    provider = os.getenv("MODEL_PROVIDER", "").lower()
    if provider in ("openrouter", "fastrouter", "openai_compat") or (not provider and os.getenv("LLM_API_KEY")):
        return OpenAICompatAdapter()
    if provider == "gemini" or (not provider and (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))):
        return GeminiAdapter()
    return AnthropicAdapter()


adapter = _pick()
