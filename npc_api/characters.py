from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

import yaml


class CharacterNotFoundError(LookupError):
    pass


class CharacterProfileError(RuntimeError):
    pass


@dataclass(frozen=True)
class CharacterProfile:
    npc_id: str
    data: dict
    source_text: str

    def value(self, section: str, field: str) -> object:
        try:
            return self.data[section][field]["значение"]
        except (KeyError, TypeError) as error:
            raise CharacterProfileError(f"Missing profile value: {section}/{field}") from error


class CharacterRepository:
    def __init__(self, npc_ids_path: Path) -> None:
        self.project_root = npc_ids_path.resolve().parent.parent
        self.npc_ids_path = npc_ids_path
        self._paths = self._read_paths()

    def _read_paths(self) -> dict[str, Path]:
        try:
            with self.npc_ids_path.open(encoding="utf-8", newline="") as file:
                rows = list(csv.DictReader(file))
        except OSError as error:
            raise CharacterProfileError(f"Cannot read NPC index: {self.npc_ids_path}") from error

        if not rows or set(rows[0]) != {"npc_id", "path"}:
            raise CharacterProfileError("NPC index must contain only npc_id,path columns")

        paths: dict[str, Path] = {}
        for row in rows:
            npc_id = row["npc_id"].strip()
            raw_path = row["path"].strip()
            if not npc_id or not raw_path or npc_id in paths:
                raise CharacterProfileError("NPC index contains an invalid or duplicate row")
            target = (self.project_root / raw_path).resolve()
            if not target.is_relative_to(self.project_root):
                raise CharacterProfileError("NPC profile path is outside project root")
            paths[npc_id] = target
        return paths

    def get(self, npc_id: str) -> CharacterProfile:
        path = self._paths.get(npc_id)
        if path is None:
            raise CharacterNotFoundError(npc_id)
        try:
            source_text = path.read_text(encoding="utf-8")
            data = yaml.safe_load(source_text)
        except (OSError, yaml.YAMLError) as error:
            raise CharacterProfileError(f"Cannot read NPC profile: {npc_id}") from error
        if not isinstance(data, dict):
            raise CharacterProfileError(f"NPC profile is not a mapping: {npc_id}")
        return CharacterProfile(npc_id=npc_id, data=data, source_text=source_text)
