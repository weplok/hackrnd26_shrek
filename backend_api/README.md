# ZERO DAY backend API

## Start

Install dependencies from repository root, copy `.env.example` into root `.env`, then run:

```bash
uv sync --project backend_api --group dev
uv run --project backend_api uvicorn backend_api.app:app --host 0.0.0.0 --port 8000
```

`GET /healthz` and `POST /api/v1/sessions` work without LLM variables. `POST /dialogue` validates LLM variables lazily.

## LLM provider and Claude Code fallback

Dialogue turns normally go to the OpenAI-compatible provider (`OPENAI_*`). Set `CLAUDE_CODE_FALLBACK=1` to fall back to the locally installed Claude Code CLI whenever that provider errors out (including when its circuit breaker is open). Set `CLAUDE_CODE_PRIORITY=1` to make Claude Code the primary LLM instead, with OpenAI as the fallback; when Claude Code leads, the `OPENAI_*` variables are optional and the API runs on Claude Code alone if they are absent. Set at most one of the two flags. The CLI runs `claude -p` with a single Claude model (`CLAUDE_CODE_MODEL`, default `sonnet`); temperature is not configurable in print mode, so it is ignored.

The CLI needs `claude` on `PATH` and an authorized credential store. In Docker, `compose.yaml` bind-mounts the host-installed, host-authorized `claude` binary into the `api` container at `/usr/local/bin/claude` and mounts the host credentials (`~/.claude`, `~/.claude.json`) with `HOME=/root`. Override `CLAUDE_HOST_BIN`, `CLAUDE_HOST_CREDS`, and `CLAUDE_HOST_CONFIG` if those host paths differ.

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

`LLM_REQUEST_TIMEOUT_SECONDS` limits one provider call. `DIALOGUE_TIMEOUT_SECONDS` limits all three calls in one dialogue request. Defaults are 25 and 80 seconds.

## Rate limit and request IDs

`POST /dialogue` and `POST /api/v1/sessions` use a local fixed-window rate limit. A blocked request returns `429` and `Retry-After`. T-A7 replaces local state with Redis.

Every response includes `X-Request-Id`. A valid incoming `X-Request-Id` is preserved. Each completed request writes one JSON log line to stdout.

## Tests

```bash
uv run --project backend_api pytest backend_api/tests
```
