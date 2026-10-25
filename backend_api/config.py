from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


class ConfigurationError(RuntimeError):
    """Raised when required runtime configuration is absent."""


PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=False)
load_dotenv(PROJECT_ROOT / "backend_api" / ".env", override=False)


def _positive_int(name: str, default: int) -> int:
    raw_value = os.getenv(name, "").strip() or str(default)
    try:
        value = int(raw_value)
    except ValueError as error:
        raise ConfigurationError(f"{name} must be an integer") from error
    if value <= 0:
        raise ConfigurationError(f"{name} must be greater than zero")
    return value


@dataclass(frozen=True)
class Settings:
    base_url: str = ""
    api_key: str = ""
    npc_model: str = ""
    injection_judge_model: str = ""
    alarm_judge_model: str = ""
    npc_ids_path: Path = PROJECT_ROOT / "chars" / "npc_ids.csv"
    session_db_path: Path = Path(__file__).resolve().parent / "data" / "sessions.sqlite3"
    anonymous_session_ttl_seconds: int = 86_400
    rate_limit_window_seconds: int = 60
    session_rate_limit: int = 10
    dialogue_rate_limit: int = 20
    llm_request_timeout_seconds: int = 60
    dialogue_timeout_seconds: int = 180
    npc_max_tokens: int = 400
    judge_max_tokens: int = 200
    telemetry_retention_days: int = 30
    redis_url: str = ""
    llm_max_retries: int = 0
    claude_code_fallback: bool = False
    claude_code_priority: bool = False
    claude_code_bin: str = "claude"
    claude_code_model: str = "sonnet"

    def _llm_values(self) -> dict[str, str]:
        return {
            "OPENAI_BASE_URL": self.base_url,
            "OPENAI_API_KEY": self.api_key,
            "NPC_MODEL": self.npc_model,
            "INJECTION_JUDGE_MODEL": self.injection_judge_model,
            "ALARM_JUDGE_MODEL": self.alarm_judge_model,
        }

    def openai_configured(self) -> bool:
        return all(self._llm_values().values())

    def require_llm(self) -> None:
        missing = [name for name, value in self._llm_values().items() if not value]
        if missing:
            raise ConfigurationError("Missing required environment variables: " + ", ".join(missing))

    @classmethod
    def from_env(cls, *, require_llm: bool = False) -> Settings:
        names = (
            "OPENAI_BASE_URL",
            "OPENAI_API_KEY",
            "NPC_MODEL",
            "INJECTION_JUDGE_MODEL",
            "ALARM_JUDGE_MODEL",
        )
        values = {name: os.getenv(name, "").strip() for name in names}
        settings = cls(
            base_url=values["OPENAI_BASE_URL"],
            api_key=values["OPENAI_API_KEY"],
            npc_model=values["NPC_MODEL"],
            injection_judge_model=values["INJECTION_JUDGE_MODEL"],
            alarm_judge_model=values["ALARM_JUDGE_MODEL"],
            npc_ids_path=Path(os.getenv("NPC_IDS_PATH", "").strip() or PROJECT_ROOT / "chars" / "npc_ids.csv"),
            session_db_path=Path(
                os.getenv("NPC_SESSION_DB_PATH", "").strip()
                or Path(__file__).resolve().parent / "data" / "sessions.sqlite3"
            ),
            anonymous_session_ttl_seconds=_positive_int("ANONYMOUS_SESSION_TTL_SECONDS", 86_400),
            rate_limit_window_seconds=_positive_int("RATE_LIMIT_WINDOW_SECONDS", 60),
            session_rate_limit=_positive_int("SESSION_RATE_LIMIT", 10),
            dialogue_rate_limit=_positive_int("DIALOGUE_RATE_LIMIT", 20),
            llm_request_timeout_seconds=_positive_int("LLM_REQUEST_TIMEOUT_SECONDS", 60),
            dialogue_timeout_seconds=_positive_int("DIALOGUE_TIMEOUT_SECONDS", 180),
            npc_max_tokens=_positive_int("NPC_MAX_TOKENS", 400),
            judge_max_tokens=_positive_int("JUDGE_MAX_TOKENS", 200),
            telemetry_retention_days=_positive_int("TELEMETRY_RETENTION_DAYS", 30),
            redis_url=os.getenv("REDIS_URL", "").strip(),
            claude_code_fallback=os.getenv("CLAUDE_CODE_FALLBACK", "").strip().lower() in {"1", "true", "yes", "on"},
            claude_code_priority=os.getenv("CLAUDE_CODE_PRIORITY", "").strip().lower() in {"1", "true", "yes", "on"},
            claude_code_bin=os.getenv("CLAUDE_CODE_BIN", "").strip() or "claude",
            claude_code_model=os.getenv("CLAUDE_CODE_MODEL", "").strip() or "sonnet",
        )
        if require_llm:
            settings.require_llm()
        return settings
