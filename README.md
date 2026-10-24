# ZERO DAY

Браузерная детективная головоломка об этичном пентесте. Кампания работает офлайн; `backend_api` обслуживает игровые сессии и живых NPC.

## Запуск за 5 минут

Нужны Node.js 22+, pnpm 12.15.0, Python 3.12, [uv](https://docs.astral.sh/uv/) и GNU Make.

```bash
git clone <repository-url>
cd hackrnd26_shrek
corepack enable
make install
cp .env.example .env
make dev
```

PowerShell-команда для env:

```powershell
Copy-Item .env.example .env
```

API будет доступен на `http://localhost:8000`. Проверка:

```bash
curl http://localhost:8000/healthz
```

Ожидаемый ответ: `{"status":"ok"}`. Переменные LLM не нужны для `/healthz` и создания анонимной сессии.

## Docker Compose

Полный стек запускается одной командой. Сначала создайте `.env` из примера и замените `POSTGRES_PASSWORD` перед развёртыванием.

```bash
docker compose up --build
```

Сайт будет доступен по `http://localhost:8080`. Контейнер `web` раздаёт SPA через Caddy и проксирует API. Redis хранит сессии и rate limit. PostgreSQL запускается с пустой baseline-миграцией; прикладные таблицы появятся в задачах T-G1 и T-F2.

Offline-профиль запускает только статику. Он не обращается к API; клиент переключается в существующий offline-режим.

```bash
docker compose --env-file .env.offline -f compose.yaml -f compose.offline.yaml up --build
```

## Переменные окружения

Корневой `.env` — основной файл конфигурации. `backend_api/.env` временно поддерживается как fallback. Переменные процесса имеют высший приоритет.

Для `POST /dialogue` заполните:

- `OPENAI_BASE_URL`
- `OPENAI_API_KEY`
- `NPC_MODEL`
- `INJECTION_JUDGE_MODEL`
- `ALARM_JUDGE_MODEL`

Остальные переменные и встроенные значения описаны комментариями в `.env.example`. Секреты нельзя коммитить.

## Команды разработки

```bash
make lint
make format-check
make typecheck
make test
make content-check
make codegen
make hooks-install
make hooks-run
```

`make codegen` обновляет TypeScript-типы и Pydantic-модели из `content/schemas`.

Pre-commit запускает `lint-staged`, Ruff и gitleaks. Полный CI добавляет T-A8.

## Структура

- `apps/web` — браузерный клиент.
- `packages/engine` — чистый TypeScript-движок.
- `packages/content-tools` — проверка и кодоген контента.
- `backend_api` — единственный Python/FastAPI-сервис и Pydantic-модели.
- `content` — схемы и версионируемый игровой контент.
- `docs` — техническое задание и дизайн-документы.

## Лицензия

[MIT](LICENSE), copyright 2026 Команда "Ш.Р.Э.К."
