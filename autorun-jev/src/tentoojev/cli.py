from __future__ import annotations

import argparse
import os
import sys

from .config import (
    DEFAULT_CHROME_PROFILE,
    DEFAULT_JEV_API_URL,
    DEFAULT_JEV_MODEL,
    DEFAULT_TENTOO_URL,
    Settings,
    load_env_file,
)
from .decision_log import DecisionLogger
from .game_loop import GameLoopError, run_game
from .jev_client import JevClient
from .solver import load_wordlist
from .webmcp import (
    WebMcpError,
    WebMcpSession,
    connect_page,
    find_chrome,
    launch_chrome,
    navigate_page,
    open_page,
    seed_webmcp_flag,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="tentoo-jev",
        description="Play the Tentoo daily word using Jev via OpenCode Zen System One and WebMCP.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="Launch Chrome and play the current daily word")
    mode_group = run.add_mutually_exclusive_group()
    mode_group.add_argument("--dueto", action="store_true", help="Play the dueto mode (2 boards, 7 rows)")
    mode_group.add_argument("--quarteto", action="store_true", help="Play the quarteto mode (4 boards, 9 rows)")
    run.add_argument("--jev-url", default=None, help=f"System One endpoint (default: {DEFAULT_JEV_API_URL})")
    run.add_argument("--model", default=None, help=f"Jev model (default: {DEFAULT_JEV_MODEL})")
    run.add_argument("--url", default=None, help=f"Tentoo URL (default: {DEFAULT_TENTOO_URL})")
    run.add_argument("--chrome-path", default=None, help="Chrome executable path")
    run.add_argument("--profile", default=None, help=f"Chrome profile directory (default: {DEFAULT_CHROME_PROFILE})")
    run.add_argument("--wordlist", default=None, help="Path to the accepted words file")
    run.add_argument("--max-candidates", type=int, default=8, help="Candidates offered to Jev per guess")
    run.add_argument("--timeout", type=float, default=20.0, help="Timeout for Chrome and Jev requests")
    run.add_argument("--strict-jev", action="store_true", help="Abort instead of fallback when Jev fails")
    run.add_argument("--log", default="logs/jev-decisions.jsonl", help="Decision log path; use '-' to disable")
    run.add_argument("--keep-chrome", action="store_true", help="Keep the launched Chrome open after the run")
    run.add_argument("-v", "--verbose", action="store_true")

    doctor = sub.add_parser("doctor", help="Check configuration, Chrome and wordlist availability")
    doctor.add_argument("--chrome-path", default=None)
    doctor.add_argument("--profile", default=None)
    doctor.add_argument("--wordlist", default=None)
    return parser


def cmd_doctor(args: argparse.Namespace) -> int:
    load_env_file()
    key = os.getenv("OPENCODE_API_KEY", "")
    settings = Settings.from_env(
        chrome_path=args.chrome_path,
        chrome_profile=args.profile,
        wordlist_path=args.wordlist,
    )
    print(f"OPENCODE_API_KEY: {'set' if key else 'MISSING'}")
    print(f"JEV_API_URL: {settings.jev_api_url}")
    print(f"JEV_MODEL: {settings.jev_model}")
    print(f"TENTOO_URL: {settings.tentoo_url}")
    chrome_ok = True
    try:
        print(f"Chrome: {find_chrome(settings.chrome_path)}")
    except WebMcpError as exc:
        chrome_ok = False
        print(f"Chrome: ERROR - {exc}")
    wordlist = load_wordlist(settings.wordlist_path) if settings.wordlist_path.exists() else []
    if wordlist:
        print(f"Wordlist: {settings.wordlist_path} ({len(wordlist)} words)")
    else:
        print(f"Wordlist: MISSING ({settings.wordlist_path})")
    if not key or not chrome_ok or not wordlist:
        return 2
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    load_env_file()
    settings = Settings.from_env(
        jev_api_url=args.jev_url,
        jev_model=args.model,
        tentoo_url=args.url,
        chrome_path=args.chrome_path,
        chrome_profile=args.profile,
        wordlist_path=args.wordlist,
        timeout=args.timeout,
        strict_jev=args.strict_jev,
        verbose=args.verbose,
    )
    if not settings.api_key:
        print("error: OPENCODE_API_KEY is not set", file=sys.stderr)
        return 2
    mode = "quarteto" if args.quarteto else "dueto" if args.dueto else "normal"
    wordlist = load_wordlist(settings.wordlist_path)
    if not wordlist:
        print(f"error: wordlist not found at {settings.wordlist_path}", file=sys.stderr)
        return 2
    chrome_path = find_chrome(settings.chrome_path)
    seed_webmcp_flag(settings.chrome_profile)
    print(f"Launching Chrome with WebMCP enabled: {chrome_path}")
    process = None
    connection = None
    try:
        process, port = launch_chrome(chrome_path, settings.chrome_profile, timeout=settings.timeout)
        target = open_page(port)
        connection = connect_page(target, settings.timeout)
        navigate_page(connection, settings.tentoo_url, timeout=settings.timeout)
        session = WebMcpSession(connection)
        session.wait_ready(timeout=settings.timeout)
        session.reset_game(mode)
        print(f"Tentoo ready with WebMCP tools at {settings.tentoo_url} (previous {mode} game cleared)")
        jev = JevClient(
            settings.jev_api_url,
            settings.jev_model,
            settings.api_key,
            timeout=settings.timeout,
            verbose=settings.verbose,
        )
        logger = DecisionLogger(args.log)
        return run_game(
            session,
            wordlist,
            jev,
            mode=mode,
            max_candidates=args.max_candidates,
            strict_jev=settings.strict_jev,
            logger=logger,
        )
    except (GameLoopError, WebMcpError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    finally:
        if connection is not None:
            connection.close()
        if process is not None and not args.keep_chrome:
            process.terminate()


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if args.command == "doctor":
        return cmd_doctor(args)
    if args.command == "run":
        return cmd_run(args)
    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    sys.exit(main())
