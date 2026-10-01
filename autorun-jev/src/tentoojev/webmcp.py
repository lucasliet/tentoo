from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path

from .chrome_cdp import ChromeCdpError, CdpConnection, WebSocket

WEBMCP_FLAG = "enable-webmcp-testing@1"
WEBMCP_FLAG_BASE = "enable-webmcp-testing"
REQUIRED_TOOL_COUNT = 5
GAME_STATE_KEY = "tentoo_game_state"


def game_state_key(mode: str) -> str:
    if mode == "normal":
        return GAME_STATE_KEY
    return f"{GAME_STATE_KEY}_{mode}"


class WebMcpError(RuntimeError):
    pass


def find_chrome(override: str | None = None) -> str:
    if override:
        return override
    candidates = [
        os.getenv("CHROME_PATH", ""),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    for name in ("google-chrome", "google-chrome-stable", "chromium"):
        found = shutil.which(name)
        if found:
            return found
    raise WebMcpError("Chrome not found; set CHROME_PATH")


def seed_webmcp_flag(profile_dir: Path) -> None:
    profile_dir.mkdir(parents=True, exist_ok=True)
    state_path = profile_dir / "Local State"
    state: dict = {}
    if state_path.exists():
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            state = {}
    browser = state.setdefault("browser", {})
    flags = browser.setdefault("enabled_labs_experiments", [])
    if WEBMCP_FLAG_BASE in flags:
        flags.remove(WEBMCP_FLAG_BASE)
    if WEBMCP_FLAG not in flags:
        flags.append(WEBMCP_FLAG)
    browser["enabled_labs_experiments"] = flags
    state_path.write_text(json.dumps(state), encoding="utf-8")


def _http_json_get(url: str, timeout: float = 2.0):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (OSError, ValueError):
        return None


def _http_json_put(url: str, timeout: float = 5.0):
    request = urllib.request.Request(url, data=b"", method="PUT")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _read_devtools_port(profile_dir: Path) -> int | None:
    try:
        first_line = (profile_dir / "DevToolsActivePort").read_text(encoding="utf-8").splitlines()[0]
        return int(first_line)
    except (OSError, IndexError, ValueError):
        return None


def _existing_browser_port(profile_dir: Path) -> int | None:
    port = _read_devtools_port(profile_dir)
    if port is None:
        return None
    version = _http_json_get(f"http://127.0.0.1:{port}/json/version")
    return port if isinstance(version, dict) else None


def launch_chrome(
    chrome_path: str, profile_dir: Path, timeout: float = 20.0
) -> tuple[subprocess.Popen | None, int]:
    existing_port = _existing_browser_port(profile_dir)
    if existing_port is not None:
        return None, existing_port
    process = subprocess.Popen(
        [
            chrome_path,
            f"--user-data-dir={profile_dir}",
            "--remote-debugging-port=0",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-sync",
            "--disable-background-networking",
            "--hide-crash-restore-bubble",
            "--window-size=1280,900",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise WebMcpError("Chrome exited during startup")
        port = _read_devtools_port(profile_dir)
        if port is not None and _http_json_get(f"http://127.0.0.1:{port}/json/version"):
            return process, port
        time.sleep(0.25)
    process.terminate()
    raise WebMcpError("Timed out waiting for Chrome DevTools")


def open_page(port: int) -> dict:
    try:
        target = _http_json_put(f"http://127.0.0.1:{port}/json/new")
        if isinstance(target, dict):
            return target
    except (OSError, ValueError):
        pass
    targets = _http_json_get(f"http://127.0.0.1:{port}/json/list", timeout=5.0)
    if isinstance(targets, list):
        for target in targets:
            if not isinstance(target, dict) or target.get("type") != "page":
                continue
            if str(target.get("url", "")) == "about:blank":
                return target
    raise WebMcpError("Could not open a new Chrome tab")


def navigate_page(connection: CdpConnection, url: str, timeout: float = 20.0) -> None:
    connection.send("Page.navigate", {"url": url})
    requested_host = urllib.parse.urlsplit(url).netloc
    deadline = time.monotonic() + timeout
    last_url = None
    while time.monotonic() < deadline:
        try:
            last_url = connection.evaluate("location.href")
            if requested_host in urllib.parse.urlsplit(str(last_url)).netloc:
                return
        except ChromeCdpError:
            pass
        time.sleep(0.25)
    raise WebMcpError(f"Timed out navigating to {url}; last URL was {last_url}")


def connect_page(target: dict, timeout: float) -> CdpConnection:
    debugger_url = str(target.get("webSocketDebuggerUrl", ""))
    if not debugger_url.startswith("ws://"):
        raise WebMcpError(f"Invalid debugger URL: {debugger_url}")
    host, _, remainder = debugger_url[len("ws://") :].partition("/")
    hostname, _, port_text = host.partition(":")
    websocket = WebSocket(hostname, int(port_text), "/" + remainder, timeout)
    return CdpConnection(websocket)


class WebMcpSession:
    def __init__(self, connection: CdpConnection):
        self._connection = connection

    def wait_ready(self, timeout: float = 20.0) -> None:
        deadline = time.monotonic() + timeout
        expression = (
            "(async () => ({"
            "available: 'modelContext' in document,"
            "tools: 'modelContext' in document ? (await document.modelContext.getTools()).length : 0"
            "}))()"
        )
        last_result = None
        while time.monotonic() < deadline:
            try:
                last_result = self._connection.evaluate(expression)
                if isinstance(last_result, dict) and last_result.get("tools", 0) >= REQUIRED_TOOL_COUNT:
                    return
            except ChromeCdpError as exc:
                last_result = str(exc)
            time.sleep(0.5)
        raise WebMcpError(f"WebMCP tools were not registered in time: {last_result}")

    def call_tool(self, name: str, args: dict | None = None) -> str:
        payload = json.dumps(args or {}, ensure_ascii=False)
        expression = (
            "(async () => {"
            f"const tool = (await document.modelContext.getTools()).find(item => item.name === {json.dumps(name)});"
            f"if (!tool) throw new Error('tool not found: ' + {json.dumps(name)});"
            f"return await document.modelContext.executeTool(tool, {json.dumps(payload)});"
            "})()"
        )
        result = self._connection.evaluate(expression)
        return "" if result is None else str(result)

    def get_state(self) -> dict:
        raw = self.call_tool("get_game_state")
        try:
            return json.loads(raw)
        except ValueError as exc:
            raise WebMcpError(f"Invalid game state: {raw}") from exc

    def reset_game(self, mode: str, timeout: float = 20.0) -> None:
        self._connection.evaluate(
            f"localStorage.removeItem({json.dumps(game_state_key(mode))})"
        )
        self._connection.evaluate("location.reload()")
        self.wait_ready(timeout)
