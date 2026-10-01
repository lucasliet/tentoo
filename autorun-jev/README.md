# tentoo-jev-opencode

Bot que joga o Tentoo (https://tentoo.pages.dev/) usando o Jev (TypeSafe System One via OpenCode Zen) para decidir cada palpite, controlando o Chrome via WebMCP. Zero dependências — apenas stdlib + pytest em dev.

Pasta isolada do website: este pacote não compartilha código com o jogo; lê apenas `../palavras_aceitas.txt` (a lista de palavras aceitas do jogo, single source of truth).

## Como rodar

```bash
cp .env.example .env   # preencha OPENCODE_API_KEY
uv sync
uv run tentoo-jev doctor          # checa key, Chrome e dicionário
uv run tentoo-jev run             # palavra do dia
uv run tentoo-jev run --dueto     # modo dueto (run isolada)
uv run tentoo-jev run --quarteto  # modo quarteto (run isolada)
uv run pytest                     # 14 testes
```

## Como funciona

- `src/tentoojev/jev_client.py` — `choice` do System One: estado + candidatos → `answers.guess.choice` + probabilidades + confidence
- `src/tentoojev/chrome_cdp.py` — cliente WebSocket RFC6455 minimal + CDP `Runtime.evaluate`
- `src/tentoojev/webmcp.py` — lança Chrome com flag `enable-webmcp-testing@1` (perfil dedicado), navega via `Page.navigate`, chama as tools (`get_game_state`, `submit_guess`)
- `src/tentoojev/solver.py` — filtra candidatos pelo feedback (verde/amarelo/cinza com duplicatas), ranqueia por frequência de letras
- `src/tentoojev/game_loop.py` — loop: estado → candidatos → decisão Jev → palpite → log JSONL em `logs/jev-decisions.jsonl`
