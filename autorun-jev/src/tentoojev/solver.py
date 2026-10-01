from __future__ import annotations

import unicodedata
from collections import Counter
from pathlib import Path

GREEN = "🟩"
YELLOW = "🟧"
GRAY = "⬛"
VOWELS = set("aeiou")


def normalize_word(word: str) -> str:
    decomposed = unicodedata.normalize("NFD", word.strip().lower())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def load_wordlist(path: str | Path) -> list[str]:
    words: list[str] = []
    seen: set[str] = set()
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        word = normalize_word(line)
        if len(word) == 5 and word.isascii() and word.isalpha() and word not in seen:
            seen.add(word)
            words.append(word)
    return words


def matches_feedback(word: str, guess: str, feedback: str) -> bool:
    word_counts = Counter(word)
    required: Counter = Counter()
    for letter, color in zip(guess, feedback):
        if color in (GREEN, YELLOW):
            required[letter] += 1
    for letter, color in zip(guess, feedback):
        if color == GRAY and word_counts[letter] > required[letter]:
            return False
    for position, (letter, color) in enumerate(zip(guess, feedback)):
        if color == GREEN and word[position] != letter:
            return False
        if color == YELLOW and word[position] == letter:
            return False
    for letter, minimum in required.items():
        if word_counts[letter] < minimum:
            return False
    return True


def filter_candidates(wordlist: list[str], rows: list[dict]) -> list[str]:
    return [
        word
        for word in wordlist
        if all(matches_feedback(word, row["guess"], row["feedback"]) for row in rows)
    ]


def rank_candidates(candidates: list[str]) -> list[tuple[int, str]]:
    frequency = Counter(letter for word in candidates for letter in set(word))
    return sorted((-sum(frequency[letter] for letter in set(word)), word) for word in candidates)


def top_candidates(candidates: list[str], limit: int = 8) -> list[str]:
    ranked = rank_candidates(candidates)
    return [word for _, word in ranked[:limit]]


def near_duplicate(first: str, second: str) -> bool:
    return len(set(first) & set(second)) >= 4


def build_options(
    pools: dict[int, list[str]],
    limit: int = 8,
    tried_words: frozenset[str] = frozenset(),
    attempts_left: int | None = None,
) -> list[str]:
    exploring = attempts_left is not None and any(
        len(pool) > attempts_left for pool in pools.values()
    )
    per_board = {index: top_candidates(pool, limit) for index, pool in pools.items()}
    scores: dict[str, tuple[int, int]] = {}
    for words in per_board.values():
        for rank, word in enumerate(words):
            rank_sum, coverage = scores.get(word, (0, 0))
            scores[word] = (rank_sum + rank, coverage + 1)
    ordered = sorted(scores, key=lambda word: (-scores[word][1], scores[word][0], word))
    if not exploring:
        return ordered[:limit]
    solvers = {word for pool in pools.values() if len(pool) == 1 for word in pool}
    allowed = [
        word
        for word in ordered
        if word in solvers or not any(near_duplicate(word, tried) for tried in tried_words)
    ]
    return (allowed or ordered)[:limit]


def describe_candidate(word: str, tried_letters: set[str]) -> str:
    letters = set(word)
    new_letters = sorted(letters - tried_letters)
    vowels = sorted(letters & VOWELS)
    uniqueness = "all letters unique" if len(letters) == 5 else "repeats a letter"
    return (
        f"new letters {''.join(new_letters) if new_letters else 'none'}; "
        f"vowels {''.join(vowels) if vowels else 'none'}; {uniqueness}"
    )


def describe_option(word: str, pools: dict[int, list[str]], tried_letters: set[str]) -> str:
    parts = []
    for index, pool in sorted(pools.items()):
        if word in pool:
            label = f"solves board {index + 1}" if len(pool) == 1 else f"board {index + 1}: {len(pool)} candidates"
            parts.append(label)
    board_info = ", ".join(parts) if parts else "information guess for every board"
    details = describe_candidate(word, tried_letters)
    return f"{board_info}; {details}"


def build_state_text(state: dict, pools: dict[int, list[str]], options: list[tuple[str, str]]) -> str:
    mode = state.get("mode", "normal")
    attempts_left = state.get("maxRows", 6) - state.get("currentRow", 0)
    lines = [
        f"Portuguese Wordle ({mode} mode: {len(pools)} unsolved board(s)).",
        "One 5-letter guess is applied to every board; each board has its own secret word.",
        f"Attempts remaining: {attempts_left}.",
        "Feedback legend: green = correct letter and position, yellow = letter exists in another position, black = letter absent.",
    ]
    for index, pool in sorted(pools.items()):
        rows = state["boards"][index].get("rows", [])
        history = "; ".join(f"{row['guess']} {row['feedback']}" for row in rows) or "none"
        lines.append(f"Board {index + 1} ({len(pool)} candidates): {history}.")
    option_lines = [f"- {word}: {description}" for word, description in options]
    return "\n".join([*lines, "Options for the next guess:", *option_lines])
