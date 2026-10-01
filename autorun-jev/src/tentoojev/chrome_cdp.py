from __future__ import annotations

import base64
import json
import os
import socket
import struct


class ChromeCdpError(RuntimeError):
    pass


class WebSocket:
    def __init__(self, host: str, port: int, path: str, timeout: float = 20.0):
        self._sock = socket.create_connection((host, port), timeout=timeout)
        self._sock.settimeout(timeout)
        self._reader = self._sock.makefile("rb")
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        handshake = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n"
        )
        self._sock.sendall(handshake.encode("ascii"))
        status_line = self._reader.readline().decode("latin-1")
        if " 101 " not in status_line:
            raise ChromeCdpError(f"WebSocket handshake failed: {status_line.strip()}")
        while True:
            line = self._reader.readline()
            if line in (b"\r\n", b"\n", b""):
                break

    def send_text(self, text: str) -> None:
        self._send_frame(0x1, text.encode("utf-8"))

    def recv_text(self) -> str:
        fragments: list[bytes] = []
        while True:
            opcode, payload, final = self._read_frame()
            if opcode == 0x8:
                raise ChromeCdpError("WebSocket closed by server")
            if opcode == 0x9:
                self._send_frame(0xA, payload)
                continue
            if opcode == 0xA:
                continue
            fragments.append(payload)
            if final:
                return b"".join(fragments).decode("utf-8")

    def close(self) -> None:
        try:
            self._send_frame(0x8, b"")
        except OSError:
            pass
        finally:
            for resource in (self._reader, self._sock):
                try:
                    resource.close()
                except OSError:
                    pass

    def _send_frame(self, opcode: int, payload: bytes) -> None:
        mask = os.urandom(4)
        header = bytearray([0x80 | opcode])
        length = len(payload)
        if length < 126:
            header.append(0x80 | length)
        elif length < 1 << 16:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", length))
        header.extend(mask)
        masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        self._sock.sendall(bytes(header) + masked)

    def _read_exact(self, size: int) -> bytes:
        data = self._reader.read(size)
        if data is None or len(data) < size:
            raise ChromeCdpError("WebSocket connection lost")
        return data

    def _read_frame(self) -> tuple[int, bytes, bool]:
        first, second = self._read_exact(2)
        final = bool(first & 0x80)
        opcode = first & 0x0F
        masked = bool(second & 0x80)
        length = second & 0x7F
        if length == 126:
            (length,) = struct.unpack("!H", self._read_exact(2))
        elif length == 127:
            (length,) = struct.unpack("!Q", self._read_exact(8))
        if length > 1 << 22:
            raise ChromeCdpError("WebSocket frame too large")
        mask = self._read_exact(4) if masked else None
        payload = self._read_exact(length) if length else b""
        if mask:
            payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        return opcode, payload, final


class CdpConnection:
    def __init__(self, websocket: WebSocket):
        self._websocket = websocket
        self._next_id = 0

    def evaluate(self, expression: str):
        self._next_id += 1
        message_id = self._next_id
        try:
            self._websocket.send_text(
                json.dumps(
                    {
                        "id": message_id,
                        "method": "Runtime.evaluate",
                        "params": {
                            "expression": expression,
                            "awaitPromise": True,
                            "returnByValue": True,
                        },
                    }
                )
            )
            while True:
                message = json.loads(self._websocket.recv_text())
                if message.get("id") != message_id:
                    continue
                if "error" in message:
                    raise ChromeCdpError(f"CDP error: {message['error']}")
                result = message.get("result", {})
                if "exceptionDetails" in result:
                    details = result["exceptionDetails"]
                    raise ChromeCdpError(
                        f"Page evaluation failed: {details.get('exception', {}).get('description', details)}"
                    )
                remote = result.get("result", {})
                return remote.get("value")
        except OSError as exc:
            raise ChromeCdpError(f"WebSocket failure: {exc}") from exc

    def send(self, method: str, params: dict | None = None) -> dict:
        self._next_id += 1
        message_id = self._next_id
        try:
            self._websocket.send_text(
                json.dumps({"id": message_id, "method": method, "params": params or {}})
            )
            while True:
                message = json.loads(self._websocket.recv_text())
                if message.get("id") != message_id:
                    continue
                if "error" in message:
                    raise ChromeCdpError(f"CDP error: {message['error']}")
                return message.get("result", {})
        except OSError as exc:
            raise ChromeCdpError(f"WebSocket failure: {exc}") from exc

    def close(self) -> None:
        self._websocket.close()
