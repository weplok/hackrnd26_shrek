# NPC dialogue API

## Start

Install dependencies, copy values from `.env.example` into `.env`, then run:

```bash
uvicorn npc_api.app:app --host 0.0.0.0 --port 8000
```

## Send a message

`POST /dialogue` accepts only this JSON shape. Unknown fields, missing fields, non-string values, and empty strings return `400`.

```json
{
  "npc_id": "emp1",
  "uuid": "player-7c4bf7f3",
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

The injection judge runs before NPC generation. It must return exactly `True` or `False`.

Each active `(npc_id, uuid)` pair uses one SQLite-backed session. Its history and trust level survive restart. A verdict of `ended` or `noticed` clears session. A later message starts a new session with profile's initial trust level.

The trust judge must return JSON with this form:

```json
{"verdict":"continue","trust_change":2}
```

`trust_change` is one of `-7`, `-4`, `-2`, `0`, `2`, `5`, or `8`. Trust stays within `0..100`. Trust below `порог_эскалации_инцидента` returns `noticed` and clears session.
