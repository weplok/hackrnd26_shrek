from __future__ import annotations

import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from uuid import UUID

from fastapi.testclient import TestClient

from backend_api.app import create_app
from backend_api.config import Settings


class FakeChatClient:
    def __init__(self, responses: list[str]) -> None:
        self.responses = iter(responses)

    async def complete(self, model: str, messages: list[dict[str, str]], temperature: float) -> str:
        return next(self.responses)


class AppContractTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary_directory.name)

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def settings(self, *, session_rate_limit: int = 10, dialogue_rate_limit: int = 10) -> Settings:
        return Settings(
            session_db_path=self.directory / "dialogue.sqlite3",
            anonymous_session_ttl_seconds=60,
            rate_limit_window_seconds=60,
            session_rate_limit=session_rate_limit,
            dialogue_rate_limit=dialogue_rate_limit,
        )

    def test_health_does_not_require_llm_configuration(self) -> None:
        with TestClient(create_app(self.settings())) as client:
            response = client.get("/healthz", headers={"X-Request-Id": "health-check-1"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})
        self.assertEqual(response.headers["X-Request-Id"], "health-check-1")

    def test_blank_optional_environment_values_use_defaults(self) -> None:
        blank_values = {
            "ANONYMOUS_SESSION_TTL_SECONDS": "",
            "RATE_LIMIT_WINDOW_SECONDS": "",
            "SESSION_RATE_LIMIT": "",
            "DIALOGUE_RATE_LIMIT": "",
            "NPC_IDS_PATH": "",
            "NPC_SESSION_DB_PATH": "",
        }
        with patch.dict("os.environ", blank_values):
            settings = Settings.from_env()

        self.assertEqual(settings.anonymous_session_ttl_seconds, 86_400)
        self.assertEqual(settings.npc_ids_path.name, "npc_ids.csv")
        self.assertEqual(settings.session_db_path.name, "sessions.sqlite3")

    def test_session_contract(self) -> None:
        with TestClient(create_app(self.settings())) as client:
            response = client.post("/api/v1/sessions")

        self.assertEqual(response.status_code, 201)
        UUID(response.json()["session_id"])
        self.assertIsNotNone(datetime.fromisoformat(response.json()["expires_at"]).tzinfo)
        self.assertTrue(response.headers["X-Request-Id"])

    def test_session_rate_limit_returns_retry_after(self) -> None:
        with TestClient(create_app(self.settings(session_rate_limit=1))) as client:
            self.assertEqual(client.post("/api/v1/sessions").status_code, 201)
            blocked = client.post("/api/v1/sessions")
            self.assertEqual(client.get("/healthz").status_code, 200)

        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.json(), {"detail": "Rate limit exceeded"})
        self.assertGreaterEqual(int(blocked.headers["Retry-After"]), 1)

    def test_dialogue_route_keeps_strict_validation(self) -> None:
        with TestClient(create_app(self.settings())) as client:
            response = client.post(
                "/dialogue",
                json={"npc_id": "emp1", "uuid": "session", "message": "", "extra": "forbidden"},
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("detail", response.json())

    def test_dialogue_success_contract_survives_package_rename(self) -> None:
        fake_client = FakeChatClient(["True", "Здравствуйте.", '{"verdict":"continue","trust_change":0}'])
        with TestClient(create_app(self.settings(), client=fake_client)) as client:
            response = client.post(
                "/dialogue",
                json={"npc_id": "emp1", "uuid": "session", "message": "Здравствуйте"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"answer": "Здравствуйте.", "verdict": "continue"})

    def test_dialogue_rate_limit(self) -> None:
        fake_client = FakeChatClient(["True", "Здравствуйте.", '{"verdict":"continue","trust_change":0}'])
        with TestClient(create_app(self.settings(dialogue_rate_limit=1), client=fake_client)) as client:
            first = client.post(
                "/dialogue",
                json={"npc_id": "emp1", "uuid": "session", "message": "Здравствуйте"},
            )
            blocked = client.post(
                "/dialogue",
                json={"npc_id": "emp1", "uuid": "session", "message": "Ещё вопрос"},
            )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(blocked.status_code, 429)
        self.assertGreaterEqual(int(blocked.headers["Retry-After"]), 1)

    def test_invalid_request_id_is_replaced(self) -> None:
        with TestClient(create_app(self.settings())) as client:
            response = client.get("/healthz", headers={"X-Request-Id": "contains spaces"})

        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.headers["X-Request-Id"], "contains spaces")
        self.assertEqual(len(response.headers["X-Request-Id"]), 32)


if __name__ == "__main__":
    unittest.main()
