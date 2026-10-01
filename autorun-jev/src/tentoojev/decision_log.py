from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class DecisionLogger:
    def __init__(self, path: str | None):
        self._path = Path(path).expanduser() if path and path != "-" else None
        if self._path is not None:
            self._path.parent.mkdir(parents=True, exist_ok=True)

    def append(self, **fields: Any) -> None:
        if self._path is None:
            return
        record = {"timestamp": datetime.now(timezone.utc).isoformat()}
        record.update(fields)
        with self._path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
