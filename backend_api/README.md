# ZERO DAY backend API

## Start

Install dependencies from repository root, copy `.env.example` into root `.env`, then run:

```bash
uv sync --project backend_api --group dev
uv run --project backend_api uvicorn backend_api.app:app --host 0.0.0.0 --port 8000
```

`GET /healthz` and `POST /api/v1/sessions` work without LLM variables. `POST /dialogue` validates LLM variables lazily.

## Create an anonymous session

```http
POST /api/v1/sessions
```

Successful response uses `201 Created`:

```json
{
  "session_id": "0a7709f1-c681-4424-b5b3-a00d87b7a00c",
  "expires_at": "2026-10-25T12:00:00Z"
}
```

## Send an NPC message

`POST /dialogue` keeps the existing contract. It accepts only this JSON shape:

```json
{
  "npc_id": "emp1",
  "uuid": "0a7709f1-c681-4424-b5b3-a00d87b7a00c",
  "message": "Добрый день. Подскажите, кто ведёт заявку?"
}
```

Successful response:

```json
{
  "answer": "...",
  "verdict": "continue"
}
```

Unknown fields, missing fields, non-string values, and empty strings return `400`.

The injection judge runs before NPC generation. It must return exactly `True` or `False`.

Each active `(npc_id, uuid)` pair uses one SQLite-backed session. Its history and trust level survive restart. A verdict of `ended` or `noticed` clears the session.

The trust judge must return JSON with this form:

```json
{ "verdict": "continue", "trust_change": 2 }
```

`trust_change` is one of `-7`, `-4`, `-2`, `0`, `2`, `5`, or `8`. Trust stays within `0..100`. Trust below `порог_эскалации_инцидента` returns `noticed` and clears the session.

## Rate limit and request IDs

`POST /dialogue` and `POST /api/v1/sessions` use a local fixed-window rate limit. A blocked request returns `429` and `Retry-After`. T-A7 replaces local state with Redis.

Every response includes `X-Request-Id`. A valid incoming `X-Request-Id` is preserved. Each completed request writes one JSON log line to stdout.

## Tests

```bash
uv run --project backend_api pytest backend_api/tests
```
