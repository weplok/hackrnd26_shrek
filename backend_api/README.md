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

## List NPCs

```http
GET /api/v1/npcs
```

Returns every `npc_id` from `chars/npc_ids.csv`: `{"npc_ids": ["emp1", "emp2"]}`.

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

The injection judge runs before NPC generation. It accepts `True` or `False`, with optional code fences or a final period.

Each active `(npc_id, uuid)` pair uses one SQLite-backed session. Its history and trust level survive restart. A verdict of `ended`, `noticed`, or `complete` clears the session. `complete` means the NPC trusted the player and handed over personal data; it is accepted only at trust `70` or higher, otherwise it is downgraded to `continue`.

The trust judge must return JSON with this form:

```json
{ "verdict": "continue", "trust_change": 2 }
```

`trust_change` is one of `-7`, `-4`, `-2`, `0`, `2`, `5`, or `8`. Trust stays within `0..100`. Trust below `порог_эскалации_инцидента` returns `noticed` and clears the session.

`LLM_REQUEST_TIMEOUT_SECONDS` limits one provider call. `DIALOGUE_TIMEOUT_SECONDS` limits all three calls in one dialogue request. Defaults are 60 and 180 seconds. `NPC_MAX_TOKENS` and `JUDGE_MAX_TOKENS` cap NPC and judge replies; defaults are 400 and 200.

## Rate limit and request IDs

`POST /dialogue` and `POST /api/v1/sessions` use a local fixed-window rate limit. A blocked request returns `429` and `Retry-After`. T-A7 replaces local state with Redis.

Every response includes `X-Request-Id`. A valid incoming `X-Request-Id` is preserved. Each completed request writes one JSON log line to stdout.

## Tests

```bash
uv run --project backend_api pytest backend_api/tests
```
