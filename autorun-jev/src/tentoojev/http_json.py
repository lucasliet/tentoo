from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass
class HttpJsonError(RuntimeError):
    message: str
    status: int | None = None
    body: str | None = None

    def __str__(self) -> str:
        parts = [self.message]
        if self.status is not None:
            parts.append(f"HTTP {self.status}")
        if self.body:
            parts.append(self.body[:500])
        return ": ".join(parts)


def post_json(
    url: str,
    payload: dict[str, Any],
    *,
    headers: dict[str, str] | None = None,
    timeout: float = 20.0,
    retries: int = 0,
    retry_statuses: tuple[int, ...] = (429, 500, 502, 503, 504, 529),
) -> dict[str, Any]:
    raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    request_headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "tentoo-jev-opencode/0.1.0",
    }
    if headers:
        request_headers.update(headers)

    attempt = 0
    while True:
        request = urllib.request.Request(url, data=raw, headers=request_headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                body = response.read().decode("utf-8")
                data = json.loads(body)
                if not isinstance(data, dict):
                    raise HttpJsonError("Expected JSON object response")
                return data
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            if attempt < retries and exc.code in retry_statuses:
                time.sleep(min(2.0, 0.25 * (2**attempt)))
                attempt += 1
                continue
            raise HttpJsonError("HTTP request failed", status=exc.code, body=body) from exc
        except urllib.error.URLError as exc:
            if attempt < retries:
                time.sleep(min(2.0, 0.25 * (2**attempt)))
                attempt += 1
                continue
            raise HttpJsonError(f"Connection failed: {exc.reason}") from exc
        except json.JSONDecodeError as exc:
            raise HttpJsonError("Server returned invalid JSON") from exc
