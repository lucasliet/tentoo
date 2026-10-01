from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

DEFAULT_JEV_API_URL = "https://opencode.ai/zen/v1/systemone"
DEFAULT_JEV_MODEL = "jev-1.13"
DEFAULT_TENTOO_URL = "https://tentoo.pages.dev/"
DEFAULT_CHROME_PROFILE = "~/.cache/tentoo-jev/chrome-profile"
DEFAULT_WORDLIST = Path(__file__).resolve().parents[3] / "palavras_aceitas.txt"


def load_env_file(path: str | Path = ".env") -> None:
    env_path = Path(path)
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


@dataclass(frozen=True)
class Settings:
    api_key: str
    jev_api_url: str = DEFAULT_JEV_API_URL
    jev_model: str = DEFAULT_JEV_MODEL
    tentoo_url: str = DEFAULT_TENTOO_URL
    chrome_path: str | None = None
    chrome_profile: Path = DEFAULT_CHROME_PROFILE
    wordlist_path: Path = DEFAULT_WORDLIST
    timeout: float = 20.0
    strict_jev: bool = False
    verbose: bool = False

    @classmethod
    def from_env(
        cls,
        *,
        api_key: str | None = None,
        jev_api_url: str | None = None,
        jev_model: str | None = None,
        tentoo_url: str | None = None,
        chrome_path: str | None = None,
        chrome_profile: str | None = None,
        wordlist_path: str | None = None,
        timeout: float = 20.0,
        strict_jev: bool = False,
        verbose: bool = False,
    ) -> Settings:
        key = api_key if api_key is not None else os.getenv("OPENCODE_API_KEY", "")
        return cls(
            api_key=key,
            jev_api_url=jev_api_url or os.getenv("JEV_API_URL", DEFAULT_JEV_API_URL),
            jev_model=jev_model or os.getenv("JEV_MODEL", DEFAULT_JEV_MODEL),
            tentoo_url=tentoo_url or os.getenv("TENTOO_URL", DEFAULT_TENTOO_URL),
            chrome_path=chrome_path or os.getenv("CHROME_PATH") or None,
            chrome_profile=Path(
                chrome_profile or os.getenv("CHROME_PROFILE", DEFAULT_CHROME_PROFILE)
            ).expanduser(),
            wordlist_path=Path(
                wordlist_path or os.getenv("WORDLIST_PATH", str(DEFAULT_WORDLIST))
            ).expanduser(),
            timeout=timeout,
            strict_jev=strict_jev,
            verbose=verbose,
        )
