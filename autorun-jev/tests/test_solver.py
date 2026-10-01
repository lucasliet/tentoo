from __future__ import annotations

import pytest

from tentoojev.solver import (
    GREEN,
    GRAY,
    YELLOW,
    build_options,
    filter_candidates,
    load_wordlist,
    matches_feedback,
    normalize_word,
    top_candidates,
)


def should_normalize_words_without_diacritics():
    assert normalize_word("Ações") == "acoes"
    assert normalize_word("ÍAMOS") == "iamos"


def should_load_wordlist_from_file(tmp_path):
    wordlist_file = tmp_path / "words.txt"
    wordlist_file.write_text("ações\nsorte\n Sorte \nab\n", encoding="utf-8")

    words = load_wordlist(wordlist_file)

    assert words == ["acoes", "sorte"]


@pytest.mark.parametrize(
    ("word", "expected"),
    [
        ("veria", True),
        ("carta", False),
    ],
)
def should_require_yellow_letter_to_exist_elsewhere(word, expected):
    feedback = GRAY + GRAY + GREEN + GRAY + YELLOW

    assert matches_feedback(word, "sorte", feedback) is expected


@pytest.mark.parametrize(
    ("word", "expected"),
    [
        ("festa", True),
        ("casas", False),
    ],
)
def should_cap_gray_letters_at_required_count(word, expected):
    feedback = YELLOW + YELLOW + GRAY + GRAY + GRAY

    assert matches_feedback(word, "sabia", feedback) is expected


def should_reject_candidate_with_yellow_letter_in_same_position():
    assert not matches_feedback("arara", "avaro", YELLOW + GRAY + YELLOW + YELLOW + GRAY)


def should_filter_candidates_by_all_rows():
    wordlist = ["veria", "cerca", "casas"]
    rows = [
        {"guess": "sorte", "feedback": GRAY + GRAY + GREEN + GRAY + YELLOW},
        {"guess": "cerca", "feedback": GREEN + GREEN + GREEN + GREEN + GREEN},
    ]

    assert filter_candidates(wordlist, rows) == ["cerca"]


def should_rank_candidates_by_common_letters():
    candidates = ["arara", "sorte"]

    assert top_candidates(candidates, limit=1) == ["sorte"]


def should_prefer_options_covering_more_boards():
    pools = {0: ["sorte", "carne"], 1: ["sorte", "perua"]}

    assert build_options(pools, limit=3)[0] == "sorte"


def should_ensure_every_board_has_a_candidate():
    pools = {0: ["sorte"], 1: ["carne", "perua"]}

    assert {"sorte", "carne"} <= set(build_options(pools, limit=2))


def should_suppress_near_duplicates_of_tried_words_while_exploring():
    # Given
    pools = {0: ["abril", "abris", "abrir", "corta", "hidro"]}

    # When
    options = build_options(pools, limit=5, tried_words=frozenset({"abriu"}), attempts_left=2)

    # Then
    assert set(options) == {"corta", "hidro"}


def should_keep_word_that_solves_a_board_while_exploring():
    # Given
    pools = {0: ["abril", "abris", "abrir", "corta"], 1: ["abrir"]}

    # When
    options = build_options(pools, limit=4, tried_words=frozenset({"abriu"}), attempts_left=2)

    # Then
    assert "abrir" in options
    assert "abril" not in options
    assert "abris" not in options


def should_offer_family_words_when_pools_fit_remaining_attempts():
    # Given
    pools = {0: ["abril", "abris", "abrir"]}

    # When
    options = build_options(pools, limit=3, tried_words=frozenset({"abriu"}), attempts_left=3)

    # Then
    assert set(options) == {"abril", "abris", "abrir"}


def should_fall_back_to_ranked_options_when_every_candidate_is_suppressed():
    # Given
    pools = {0: ["abril", "abris", "abrir"]}

    # When
    options = build_options(pools, limit=3, tried_words=frozenset({"abriu"}), attempts_left=2)

    # Then
    assert set(options) == {"abril", "abris", "abrir"}
