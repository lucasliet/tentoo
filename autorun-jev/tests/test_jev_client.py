from __future__ import annotations

import pytest

from tentoojev import jev_client
from tentoojev.jev_client import JevClient, JevDecision, JevError


def should_map_chosen_option_to_word(monkeypatch):
    captured = {}

    def fake_post_json(url, payload, **kwargs):
        captured["url"] = url
        captured["payload"] = payload
        captured["authorization"] = kwargs["headers"]["Authorization"]
        return {
            "answers": {
                "guess": {
                    "type": "choice",
                    "choice": "option_1",
                    "probabilities": {"option_0": 0.3, "option_1": 0.7},
                    "confidence": 0.7,
                }
            }
        }

    monkeypatch.setattr(jev_client, "post_json", fake_post_json)
    client = JevClient("https://example.test/systemone", "jev-1.13", "secret")

    decision = client.decide("state text", [("sorte", "vowel rich"), ("carta", "balanced")])

    assert decision.word == "carta"
    assert decision.probabilities == {"sorte": 0.3, "carta": 0.7}
    assert decision.confidence == 0.7
    assert captured["url"] == "https://example.test/systemone"
    assert captured["authorization"] == "Bearer secret"
    assert captured["payload"]["model"] == "jev-1.13"
    assert captured["payload"]["questions"]["guess"]["criteria"] == {
        "option_0": "sorte: vowel rich",
        "option_1": "carta: balanced",
    }


def should_raise_when_choice_is_unknown(monkeypatch):
    monkeypatch.setattr(
        jev_client,
        "post_json",
        lambda url, payload, **kwargs: {
            "answers": {"guess": {"type": "choice", "choice": "option_9"}}
        },
    )
    client = JevClient("https://example.test/systemone", "jev-1.13", "secret")

    with pytest.raises(JevError, match="Invalid Jev choice"):
        client.decide("state text", [("sorte", "vowel rich")])


def should_raise_when_api_key_is_missing():
    client = JevClient("https://example.test/systemone", "jev-1.13", "")

    with pytest.raises(JevError, match="OPENCODE_API_KEY"):
        client.decide("state text", [("sorte", "vowel rich")])
