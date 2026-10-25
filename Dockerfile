FROM node:22-bookworm-slim AS node

FROM python:3.12-slim-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

ENV PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/opt/trevyn-venv \
    PATH=/opt/trevyn-venv/bin:$PATH \
    EVIDENCE_DIR=/tmp/trevyn-evidence
WORKDIR /app
COPY . .
RUN python -m pip install --no-cache-dir uv \
    && uv sync --frozen --no-dev \
    && uv run playwright install --with-deps chromium \
    && cd apps/web && npm ci --include=dev --no-audit --no-fund

CMD ["sh", "-c", "uvicorn trevyn_api.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
