FROM ghcr.io/astral-sh/uv:0.9.6-python3.12-bookworm-slim

WORKDIR /app

COPY backend_api/pyproject.toml backend_api/uv.lock ./backend_api/
RUN uv sync --frozen --no-dev --project backend_api

COPY backend_api ./backend_api
COPY chars ./chars

ENV PYTHONPATH=/app
CMD ["uv", "run", "--no-dev", "--project", "backend_api", "uvicorn", "backend_api.app:app", "--host", "0.0.0.0", "--port", "8000"]
