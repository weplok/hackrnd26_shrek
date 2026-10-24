from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

class ConfigurationError(RuntimeError):
    """Raised when required runtime configuration is absent."""


PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / "npc_api" / ".env", override=False)


@dataclass(frozen=True)
class Settings:
    base_url: str
    api_key: str
    npc_model: str
    injection_judge_model: str
    alarm_judge_model: str
    npc_ids_path: Path
    session_db_path: Path

    @classmethod
    def from_env(cls) -> "Settings":
        names = (
            "OPENAI_BASE_URL",
            "OPENAI_API_KEY",
            "NPC_MODEL",
            "INJECTION_JUDGE_MODEL",
            "ALARM_JUDGE_MODEL",
        )
        values = {name: os.getenv(name, "").strip() for name in names}
        missing = [name for name, value in values.items() if not value]
        if missing:
            raise ConfigurationError("Missing required environment variables: " + ", ".join(missing))

        return cls(
            base_url=values["OPENAI_BASE_URL"],
            api_key=values["OPENAI_API_KEY"],
            npc_model=values["NPC_MODEL"],
            injection_judge_model=values["INJECTION_JUDGE_MODEL"],
            alarm_judge_model=values["ALARM_JUDGE_MODEL"],
            npc_ids_path=Path(os.getenv("NPC_IDS_PATH", PROJECT_ROOT / "chars" / "npc_ids.csv")),
            session_db_path=Path(
                os.getenv("NPC_SESSION_DB_PATH", Path(__file__).resolve().parent / "data" / "sessions.sqlite3")
            ),
        )
