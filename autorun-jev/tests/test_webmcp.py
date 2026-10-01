from __future__ import annotations

from tentoojev.webmcp import WebMcpSession, game_state_key


class _StubConnection:
    def __init__(self):
        self.expressions = []

    def evaluate(self, expression):
        self.expressions.append(expression)
        return None


def should_build_game_state_key_per_mode():
    assert game_state_key("normal") == "tentoo_game_state"
    assert game_state_key("dueto") == "tentoo_game_state_dueto"
    assert game_state_key("quarteto") == "tentoo_game_state_quarteto"


def should_clear_saved_state_and_reload_on_reset(monkeypatch):
    # Given
    connection = _StubConnection()
    session = WebMcpSession(connection)
    monkeypatch.setattr(session, "wait_ready", lambda: None)

    # When
    session.reset_game("dueto")

    # Then
    assert connection.expressions[0] == 'localStorage.removeItem("tentoo_game_state_dueto")'
    assert connection.expressions[1] == "location.reload()"
