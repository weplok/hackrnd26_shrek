from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .characters import CharacterNotFoundError, CharacterProfileError, CharacterRepository
from .config import ConfigurationError, Settings
from .llm import ChatClient, ModelError, OpenAIChatClient
from .schemas import DialogueRequest, DialogueResponse
from .service import DialogueService
from .storage import SessionStore


def create_app(settings: Settings | None = None, client: ChatClient | None = None) -> FastAPI:
    app = FastAPI(title="NPC dialogue API", version="0.1.0")
    app.state.settings = settings
    app.state.client = client
    app.state.service = None

    def get_service() -> DialogueService:
        if app.state.service is None:
            runtime_settings = app.state.settings or Settings.from_env()
            app.state.service = DialogueService(
                settings=runtime_settings,
                characters=CharacterRepository(runtime_settings.npc_ids_path),
                sessions=SessionStore(runtime_settings.session_db_path),
                client=app.state.client or OpenAIChatClient(runtime_settings),
            )
        return app.state.service

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, error: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_400_BAD_REQUEST, content={"detail": jsonable_encoder(error.errors())})

    @app.exception_handler(ConfigurationError)
    async def configuration_error_handler(_: Request, __: ConfigurationError) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": "Server configuration error"})

    @app.exception_handler(CharacterNotFoundError)
    async def character_not_found_handler(_: Request, __: CharacterNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_404_NOT_FOUND, content={"detail": "NPC not found"})

    async def runtime_error_handler(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(status_code=status.HTTP_502_BAD_GATEWAY, content={"detail": "NPC service is temporarily unavailable"})

    app.add_exception_handler(CharacterProfileError, runtime_error_handler)
    app.add_exception_handler(ModelError, runtime_error_handler)

    @app.post("/dialogue", response_model=DialogueResponse)
    async def dialogue(request: DialogueRequest) -> DialogueResponse:
        return await get_service().reply(request.npc_id, request.uuid, request.message)

    return app


app = create_app()
