from __future__ import annotations

import time

from .decision_log import DecisionLogger
from .jev_client import JevClient, JevError
from .solver import (
    build_options,
    build_state_text,
    describe_option,
    filter_candidates,
)
from .webmcp import WebMcpSession


class GameLoopError(RuntimeError):
    pass


def run_game(
    session: WebMcpSession,
    wordlist: list[str],
    jev: JevClient,
    *,
    mode: str = "normal",
    max_candidates: int = 8,
    strict_jev: bool = False,
    logger: DecisionLogger | None = None,
) -> int:
    state = session.get_state()
    if state.get("mode") != mode:
        if not state.get("finished") and state.get("currentRow", 0) > 0:
            print(f"Discarding unfinished {state.get('mode')} game to switch to {mode}.")
        session.call_tool("switch_mode", {"mode": mode})
        state = session.get_state()
        if state.get("mode") != mode:
            raise GameLoopError(f"Failed to switch to {mode} mode")
    if state.get("finished"):
        _print_summary(state)
        return 0 if state.get("won") else 1
    while not state.get("finished"):
        boards = state.get("boards", [])
        unsolved = {
            index: board for index, board in enumerate(boards) if not board.get("solved")
        }
        if not unsolved:
            break
        pools = {
            index: filter_candidates(wordlist, board.get("rows", []))
            for index, board in unsolved.items()
        }
        if any(not pool for pool in pools.values()):
            raise GameLoopError("No dictionary word matches the feedback of every unsolved board")
        tried_words = {
            row["guess"] for board in boards for row in board.get("rows", [])
        }
        tried_letters = {
            letter
            for board in boards
            for row in board.get("rows", [])
            for letter in row["guess"]
        }
        attempts_left = state.get("maxRows", 6) - state.get("currentRow", 0)
        options = [
            (word, describe_option(word, pools, tried_letters))
            for word in build_options(
                pools, max_candidates, tried_words=tried_words, attempts_left=attempts_left
            )
        ]
        source = "jev"
        probabilities: dict[str, float] = {}
        confidence: float | None = None
        if len(options) == 1:
            guess_word = options[0][0]
            source = "single-candidate"
        else:
            try:
                decision = jev.decide(build_state_text(state, pools, options), options)
                guess_word = decision.word
                probabilities = decision.probabilities
                confidence = decision.confidence
            except JevError as exc:
                if strict_jev:
                    raise
                guess_word = options[0][0]
                source = f"fallback: {exc}"
        previous_row = state.get("currentRow", 0)
        submit_result = session.call_tool("submit_guess", {"word": guess_word})
        state = session.get_state()
        for _ in range(10):
            if state.get("currentRow", 0) != previous_row or state.get("finished"):
                break
            time.sleep(0.5)
            state = session.get_state()
        boards = state.get("boards", [])
        board_feedback = " ".join(
            f"b{index + 1} {board.get('rows', [{}])[-1].get('feedback', '')}"
            for index, board in enumerate(boards)
            if board.get("rows")
        )
        if logger is not None:
            logger.append(
                attempt=state.get("currentRow", previous_row + 1),
                word=guess_word,
                mode=mode,
                feedback=board_feedback,
                solved_boards=sum(1 for board in boards if board.get("solved")),
                total_boards=len(boards),
                source=source,
                probabilities=probabilities,
                confidence=confidence,
                remaining_candidates={f"board_{index + 1}": len(pool) for index, pool in pools.items()},
                submit_result=submit_result,
            )
        print(
            f"Guess {state.get('currentRow', previous_row + 1)}: {guess_word} | "
            f"{board_feedback} ({source})"
        )
    _print_summary(state)
    return 0 if state.get("won") else 1


def _print_summary(state: dict) -> None:
    outcome = "won" if state.get("won") else "lost"
    print(f"Game finished: {outcome}")
    for board in state.get("boards", []):
        for row in board.get("rows", []):
            print(f"  {row['guess']} {row['feedback']}")
