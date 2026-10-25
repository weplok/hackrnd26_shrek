from __future__ import annotations

import json
import logging
import re
import sys
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from time import perf_counter
from typing import cast
from uuid import uuid4

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from redis.asyncio import Redis

from .characters import CharacterNotFoundError, CharacterProfileError, CharacterRepository
from .config import ConfigurationError, Settings
from .llm import CircuitBreakingLlm, LlmClient, ModelError, OpenAICompatibleLlm
from .rate_limit import FixedWindowRateLimiter, RateLimitExceeded, RedisFixedWindowRateLimiter
from .schemas import (
    DialogueRequest,
    DialogueResponse,
    HealthResponse,
    NpcListResponse,
    SessionResponse,
    TelemetryRequest,
    TelemetryResponse,
)
from .service import DialogueService
from .sessions import AnonymousSessionStore, RedisAnonymousSessionStore
from .storage import SessionStore
from .telemetry import TelemetryStore

REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
request_logger = logging.getLogger("backend_api.requests")
if not request_logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    request_logger.addHandler(handler)
request_logger.setLevel(logging.INFO)
request_logger.propagate = False


def build_llm_client(settings: Settings) -> LlmClient:
    return CircuitBreakingLlm(OpenAICompatibleLlm(settings))


def create_app(settings: Settings | None = None, client: LlmClient | None = None) -> FastAPI:
    app = FastAPI(title="ZERO DAY backend API", version="0.2.0")
    app.state.settings = settings
    app.state.client = client
    app.state.service = None
    app.state.anonymous_sessions = None
    app.state.rate_limiter = None
    app.state.redis = None
    app.state.telemetry = None

    def get_settings() -> Settings:
        if app.state.settings is None:
            app.state.settings = Settings.from_env()
        return cast(Settings, app.state.settings)

    def get_service() -> DialogueService:
        if app.state.service is None:
            runtime_settings = get_settings()
            if app.state.client is None:
                runtime_settings.require_llm()
            app.state.service = DialogueService(
                settings=runtime_settings,
                characters=CharacterRepository(runtime_settings.npc_ids_path),
                sessions=SessionStore(runtime_settings.session_db_path),
                client=app.state.client or build_llm_client(runtime_settings),
            )
        return cast(DialogueService, app.state.service)

    def get_redis() -> Redis | None:
        runtime_settings = get_settings()
        if not runtime_settings.redis_url:
            return None
        if app.state.redis is None:
            app.state.redis = Redis.from_url(runtime_settings.redis_url, decode_responses=True)
        return cast(Redis, app.state.redis)

    def get_anonymous_sessions() -> AnonymousSessionStore | RedisAnonymousSessionStore:
        if app.state.anonymous_sessions is None:
            redis = get_redis()
            app.state.anonymous_sessions = (
                RedisAnonymousSessionStore(redis, get_settings().anonymous_session_ttl_seconds)
                if redis is not None
                else AnonymousSessionStore(get_settings().anonymous_session_ttl_seconds)
            )
        return cast(AnonymousSessionStore | RedisAnonymousSessionStore, app.state.anonymous_sessions)

    def get_rate_limiter() -> FixedWindowRateLimiter | RedisFixedWindowRateLimiter:
        if app.state.rate_limiter is None:
            redis = get_redis()
            app.state.rate_limiter = (
                RedisFixedWindowRateLimiter(redis, get_settings().rate_limit_window_seconds)
                if redis is not None
                else FixedWindowRateLimiter(get_settings().rate_limit_window_seconds)
            )
        return cast(FixedWindowRateLimiter | RedisFixedWindowRateLimiter, app.state.rate_limiter)

    def get_telemetry() -> TelemetryStore:
        if app.state.telemetry is None:
            runtime_settings = get_settings()
            app.state.telemetry = TelemetryStore(
                runtime_settings.session_db_path.with_name("telemetry.sqlite3"),
                runtime_settings.telemetry_retention_days,
            )
        return cast(TelemetryStore, app.state.telemetry)

    def client_ip(request: Request) -> str:
        return request.client.host if request.client is not None else "unknown"

    @app.middleware("http")
    async def request_context(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        supplied_request_id = request.headers.get("X-Request-Id", "")
        request_id = supplied_request_id if REQUEST_ID_PATTERN.fullmatch(supplied_request_id) else uuid4().hex
        request.state.request_id = request_id
        started_at = perf_counter()
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        request_logger.info(
            json.dumps(
                {
                    "ts": datetime.now(UTC).isoformat(),
                    "level": "info",
                    "msg": "request_completed",
                    "request_id": request_id,
                    "route": request.url.path,
                    "method": request.method,
                    "status_code": response.status_code,
                    "latency_ms": round((perf_counter() - started_at) * 1000, 3),
                },
                ensure_ascii=False,
                separators=(",", ":"),
            )
        )
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, error: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST, content={"detail": jsonable_encoder(error.errors())}
        )

    @app.exception_handler(ConfigurationError)
    async def configuration_error_handler(_: Request, __: ConfigurationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Server configuration error"},
        )

    @app.exception_handler(CharacterNotFoundError)
    async def character_not_found_handler(_: Request, __: CharacterNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "NPC not found"})

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(_: Request, error: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"detail": "Rate limit exceeded"},
            headers={"Retry-After": str(error.retry_after)},
        )

    @app.exception_handler(Exception)
    async def unexpected_error_handler(request: Request, error: Exception) -> JSONResponse:
        request_logger.error(
            json.dumps(
                {
                    "ts": datetime.now(UTC).isoformat(),
                    "level": "error",
                    "msg": "request_failed",
                    "request_id": getattr(request.state, "request_id", "unknown"),
                    "route": request.url.path,
                    "method": request.method,
                    "error_type": type(error).__name__,
                    "error": str(error)[:200],
                },
                separators=(",", ":"),
            )
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"},
        )

    async def runtime_error_handler(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={"detail": "NPC service is temporarily unavailable"},
        )

    app.add_exception_handler(CharacterProfileError, runtime_error_handler)
    app.add_exception_handler(ModelError, runtime_error_handler)

    @app.get("/healthz", response_model=HealthResponse)
    async def healthz() -> HealthResponse:
        return HealthResponse()

    @app.post("/api/v1/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
    async def create_session(request: Request) -> SessionResponse:
        runtime_settings = get_settings()
        await get_rate_limiter().check(
            f"sessions:ip:{client_ip(request)}",
            runtime_settings.session_rate_limit,
        )
        session = await get_anonymous_sessions().create()
        return SessionResponse(session_id=session.session_id, expires_at=session.expires_at)

    @app.get("/api/v1/npcs", response_model=NpcListResponse)
    async def list_npcs() -> NpcListResponse:
        return NpcListResponse(npc_ids=CharacterRepository(get_settings().npc_ids_path).ids())

    @app.post("/dialogue", response_model=DialogueResponse)
    async def dialogue(payload: DialogueRequest, request: Request) -> DialogueResponse:
        runtime_settings = get_settings()
        limiter = get_rate_limiter()
        await limiter.check(f"dialogue:ip:{client_ip(request)}", runtime_settings.dialogue_rate_limit)
        await limiter.check(f"dialogue:session:{payload.uuid}", runtime_settings.dialogue_rate_limit)
        return await get_service().reply(payload.npc_id, payload.uuid, payload.message)

    @app.post("/telemetry", response_model=TelemetryResponse, status_code=status.HTTP_202_ACCEPTED)
    async def telemetry(payload: TelemetryRequest) -> TelemetryResponse:
        return TelemetryResponse(accepted=get_telemetry().record(payload.events))

    return app


app = create_app()
