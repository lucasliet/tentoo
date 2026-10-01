from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .http_json import HttpJsonError, post_json


class JevError(RuntimeError):
    pass


GUESS_INSTRUCTIONS = (
    "Choose the next 5-letter Portuguese word guess most likely to win this "
    "Wordle-style game. Early guesses should maximize information using common "
    "Portuguese letters and vowels. When few candidates remain, prefer the most "
    "likely answer. When several boards are unsolved and attempts are limited, "
    "strongly prefer options that introduce new letters over near-duplicates of "
    "already guessed words, unless the option solves a board. Every option is a "
    "valid dictionary word consistent with all feedback received so far."
)


@dataclass(frozen=True)
class JevDecision:
    word: str
    probabilities: dict[str, float]
    confidence: float | None
    raw: dict[str, Any]


class JevClient:
    def __init__(
        self,
        api_url: str,
        model: str,
        api_key: str,
        *,
        timeout: float = 20.0,
        verbose: bool = False,
    ):
        self.api_url = api_url
        self.model = model
        self.api_key = api_key
        self.timeout = timeout
        self.verbose = verbose

    def decide(self, state_text: str, options: list[tuple[str, str]]) -> JevDecision:
        if not self.api_key:
            raise JevError("OPENCODE_API_KEY is not set")
        if not options:
            raise JevError("No candidates supplied")
        word_by_option: dict[str, str] = {}
        criteria: dict[str, str] = {}
        for index, (word, description) in enumerate(options):
            option = f"option_{index}"
            word_by_option[option] = word
            criteria[option] = f"{word}: {description}"
        payload: dict[str, Any] = {
            "model": self.model,
            "state": state_text,
            "questions": {
                "guess": {
                    "type": "choice",
                    "instructions": GUESS_INSTRUCTIONS,
                    "criteria": criteria,
                }
            },
        }
        try:
            data = post_json(
                self.api_url,
                payload,
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=self.timeout,
                retries=3,
            )
        except HttpJsonError as exc:
            raise JevError(str(exc)) from exc

        answers = data.get("answers")
        if not isinstance(answers, dict):
            raise JevError(f"Invalid Jev response: missing answers: {data}")
        answer = answers.get("guess")
        if not isinstance(answer, dict):
            raise JevError(f"Invalid Jev response: missing guess answer: {data}")
        option = answer.get("choice")
        if option not in word_by_option:
            raise JevError(f"Invalid Jev choice {option!r}")
        probabilities: dict[str, float] = {}
        raw_probabilities = answer.get("probabilities")
        if isinstance(raw_probabilities, dict):
            for key, value in raw_probabilities.items():
                try:
                    probabilities[word_by_option.get(str(key), str(key))] = float(value)
                except (TypeError, ValueError):
                    continue
        confidence_raw = answer.get("confidence")
        try:
            confidence = float(confidence_raw) if confidence_raw is not None else None
        except (TypeError, ValueError):
            confidence = None
        return JevDecision(
            word=word_by_option[option],
            probabilities=probabilities,
            confidence=confidence,
            raw=data,
        )
