---
name: tentoo-e2e
description: Teste e2e completo do Tentoo (Wordle PT-BR multi-board) em navegador real — UI dos 3 modos, vitórias com confete, modais, persistência e ferramentas WebMCP, incluindo validação nativa no Chrome via CDP. Use sempre que o usuário pedir para testar ou validar o jogo, subir o site, validar WebMCP, checar regressões de comportamento ou animações do Tentoo — mesmo que não diga "e2e".
---

# Teste e2e do Tentoo

Playbook de validação ponta a ponta em navegador real, derivado da bateria executada nesta sessão. Cobertura: render, toasts, vitória + confete, modais, compartilhar, persistência, modos Dueto/Quarteto e o contrato WebMCP (`document.modelContext`).

Regra de ouro: **toda validação é comportamental** — observa o DOM, localStorage, canvas e screenshots reais. Nada de "o código parece certo".

## 1. Subir o site

Na raiz do repo, em background:

```bash
python3 -m http.server 8123
```

O alvo é `http://localhost:8123/`. Se já houver um servidor em execução, reutilize (confira com `curl -s --max-time 2 http://localhost:8123/`).

## 2. Calcular as palavras do dia

Para forçar caminhos de vitória sem depender de sorte, use o próprio algoritmo do jogo (dia 0 = 02/01/2022 fuso America/Sao_Paulo; índice invertido `WORDS.length - 1 - idx`; Dueto avança de 2 em 2 por listas pré-embaralhadas com offset de 51 dias; Quarteto de 4 em 4):

```bash
node .agents/skills/tentoo-e2e/scripts/daily-words.mjs
```

Saída: JSON com `normal`, `dueto` (2 palavras) e `quarteto` (4 palavras) e suas versões normalizadas (sem acento — é assim que o jogo as tipa; ex.: "pavão" → "pavao", "quiçá" → "quica").

## 3. Protocolo de automação

A skill `browser-use:control-browser` não está instalada neste ambiente — a bateria roda com **Chrome headless isolado + CDP puro** via `scripts/cdp-connect.mjs` (precisa de `ws@8` em `/tmp/webmcp-cdp/node_modules`; fora do node_repl, `NODE_PATH=/tmp/webmcp-cdp/node_modules node script.mjs` resolve o import):

```bash
rm -rf /tmp/chrome-tentoo-e2e && ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir=/tmp/chrome-tentoo-e2e --remote-debugging-port=9222 \
  --no-first-run --no-default-browser-check --enable-features=WebMCPTesting \
  --window-size=1280,720 --headless=new about:blank >/dev/null 2>&1 &)
```

Armadilhas específicas deste ambiente, aprendidas a preço de bug:

- **`handleKey` ignora entrada durante `isAnimating`** (`js/TentooGame.js`): letras digitadas no meio do reveal são descartadas silenciosamente. SEMPRE aguarde `window.__tentoo.getGame().isAnimating === false` (+~350ms) após cada Enter antes de digitar o próximo palpite. Polling de 200ms com timeout de 10s. Sleep fixo de 1,5s NÃO basta no Quarteto (4 boards revelando em stagger).
- **Navegar só mudando o hash (`/#dueto`) NÃO dispara load event** — o `waitForLoad()` trava. Para forçar reload completo, mude a query string (`/?t=123#dueto`).
- **O teclado virtual não tem `data-key`**: Enter é `.key` com `textContent === 'Enter'` (classe `wide`), backspace é a `.key` que contém `<svg>`. As letras casam com `textContent.trim()`.
- **`get_game_state` (WebMCP) retorna string JSON**, não objeto — asseire com regex sobre a string ou de um `JSON.parse`.
- Cada chamada CDP `Runtime.evaluate` roda isolada: reconecte/injete helpers em toda célula; `evalJs` precisa de função envolvida (`(() => {...})()`) para múltiplas declarações.
- O pointer probe falha com "no click point" em elementos dentro de overlays criados dinamicamente (botão compartilhar, opções do dropdown). Diagnóstico: `document.elementFromPoint(centro)` — se aceta o elemento, clique via `evaluate(() => el.click())`. Não é bug do site.
- Para ler estado interno do jogo use o hook de teste `window.__tentoo` (`getGame()` / `startGame(mode)`), criado pelo `main.js`.
- Screenshots headless: `--virtual-time-budget` deixa a tela preta; para validar layout sem animações, injete `*{animation:none!important; transition:none!important}` numa página de harness e tire o screenshot sem o budget.

## 4. Matriz de teste de UI

Valores esperados no modo normal (window ~1280×720): **30 tiles** em `#boards-container .tile` (6 linhas × 5 colunas — o modo normal tem 6 tentativas), 28 teclas, tooltip de ajuda visível nos primeiros ~3s.

- **Toasts**: leia SEMPRE o último (`document.querySelectorAll('.toast')` → último elemento) e espere ≥2,2s entre toasts — toasts "mortos" continuam no DOM até 4s (bug conhecido, ver plano 001 em `plans/`). Palavra incompleta → "Palavra incompleta"; inexistente → "Palavra repetida ou não encontrada" e a linha NÃO commita (`currentRow` inalterado).
- **Vitória**: digite a palavra do dia no teclado virtual (`.key` cliques ou backspace para limpar), com `waitSettled` entre palpites (ver passo 3). Esperado: `finished/won = true`, tiles da linha vencedora com classe `correct` + `bounce`, `<canvas class="confetti-canvas">` no DOM, stats gravadas (`tentoo_stats`, `tentoo_stats_dueto`, `tentoo_stats_quarteto` — distribution na linha da vitória). Confirme `finished` por polling (`waitFinished`) em vez de sleep fixo — o reveal + `showEndScreen` (1200ms) passa do sleep de 1,2s.
- **Modal de resultado**: vive no overlay criado dinamicamente pelo jogo — NÃO no `#modal-overlay` estático do index.html. Verifique: `.modal-overlay` visível contendo `#share-btn` e um `.result-word` **por board** (1 normal / 2 dueto / 4 quarteto) com `style="--wi:N"` (stagger 70ms) e classes `win`/`lose`. O overlay fica aberto ao trocar de modo — feche todos com `[...document.querySelectorAll('.modal-overlay')].forEach(o => o.classList.add('hidden'))` antes de prosseguir.
- **Modal e overflow**: o `.modal` é limitado a `calc(100dvh - 40px)` com scroll interno (fix de 05/10/2026). Em 720px de altura o Quarteto fica com exatamente 680px (`modalH <= vh - 40 + 2`); `scrollHeight` pode ser 2px menor que `offsetHeight` (borda) — não use `scrollHeight > offsetHeight` como critério de conteúdo cortado.
- **Compartilhar**: clipboard indisponível → toast "Erro" (caminho de falha válido). Para o caminho de sucesso, substitua `navigator.clipboard` por stub (`defineProperty`) e espere toast "Copiado!" + texto `Tentoo DD/MM/YYYY X/6\n\n🟩...\n\nhttps://tentoo.pages.dev`.
- **Persistência**: recarregue a página após vencer. Esperado: estado restaurado, board re-renderizado verde, end screen reaberto sozinho (~600ms) e **nenhum** confetti-canvas (reload não celebra).
- **Modais**: ajuda abre e fecha pelo `#help-btn` / `#help-modal-close`; stats pós-fim reabre o end screen (por design); debug = `pointerdown` sintético no `#help-btn`, espera 7,3s, lê o overlay de debug (mostra palavras Tentoo + Termoo) — não mova o ponteiro durante o hold (pointerleave cancela o timer).
- **Modos**: dropdown → Dueto: 2 boards / 7 linhas / 70 tiles de jogo (85 no DOM inteiro: 15 são mini-tiles do modal de ajuda); Quarteto: 4 boards / 9 linhas / 180 tiles. Palavras devem bater com o passo 2; dropdown `.active` e `body.mode-*` sincronizados.
- **Erros JS**: mantenha um coletor `window.__errs` (após cada reload reinsira) e confirme vazio ao final.

### Capturando o confete

Janela de visibilidade das letras: partículas nascem acima do viewport e o fade começa em 2,6s (some por ~1s). O SWEET SPOT de screenshot é **1,5–2,5s após o palpite vencedor terminar o reveal**. Antes de 1s não há letras visíveis; depois de ~3,5s já sumiram. Prova mecânica quando o timing falhar: desenhe o canvas num canvas offscreen e conte pixels com alpha > 0 (deve subir entre duas amostras de 300ms).

## 5. Validando WebMCP

### 5a. Detecção graceful (obrigatório)

`'modelContext' in document` — sem a API (navegador antigo/sem flag): a página carrega sem erros, nada é registrado, o jogo funciona 100%. É um teste em si.

### 5b. Cobertura com mock (quando a API nativa não existe)

Instale um mock ANTES de qualquer script da página rodar — com CDP, via `Page.addScriptToEvaluateOnNewDocument`:

```js
document.modelContext = {
  tools: {},
  async registerTool(t) { this.tools[t.name] = t; return t.name; },
  async getTools() { return Object.values(this.tools); },
  async executeTool(name, args) { return this.tools[name].execute(args, { signal: new AbortController().signal }); }
};
```

Valide: 5 ferramentas registradas; cada `execute` contra o jogo vivo (estado, dicionário com acento, stats por modo, rejeição de palavra inválida, vitória completa por ferramenta, `switch_mode`).

### 5c. Validação nativa no Chrome real (via CDP)

Requisitos: Chrome 149+ (origin trial) ou flag `chrome://flags/#enable-webmcp-testing` (feature `WebMCPTesting`). O Chrome 153 testado já expõe `document.modelContext` com `--enable-features=WebMCPTesting`.

Lance uma instância ISOLADA (nunca debug no perfil do usuário). O `--headless=new` funciona para tudo, incluindo animações CSS e WebMCP:

```bash
rm -rf /tmp/chrome-tentoo-e2e && ("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir=/tmp/chrome-tentoo-e2e --remote-debugging-port=9222 \
  --no-first-run --no-default-browser-check --enable-features=WebMCPTesting \
  --window-size=1280,720 --headless=new about:blank >/dev/null 2>&1 &)
```

Conecte via `scripts/cdp-connect.mjs` (precisa de `ws@8`; o helper já resolve `ws` ou `globalThis.WebSocket`):

```bash
mkdir -p /tmp/webmcp-cdp && cd /tmp/webmcp-cdp && npm init -y >/dev/null && npm install ws@8 --no-fund --no-audit
```

```js
const { pathToFileURL } = await import("node:url");
const { connect } = await import(pathToFileURL("/Users/lucas/Projetos/Pessoal/tentoo/.agents/skills/tentoo-e2e/scripts/cdp-connect.mjs").href);
const cdp = await connect({ url: "http://localhost:8123/" });
await cdp.send("Page.navigate", { url: "http://localhost:8123/" });
await cdp.waitForLoad();
const tools = await cdp.evalJs(`(await document.modelContext.getTools()).map(t => t.name)`);
```

**Nomes reais das 5 ferramentas registradas pelo site**: `check_word` (`{word}` → dicionário, aceita acento: "pavão" → `pavao`), `get_game_state`, `get_stats`, `submit_guess` (`{word}`), `switch_mode` (`{mode}`). Não são `get_state`/`get_dictionary_info` — procurar nome errado faz `executeTool` receber `undefined` e lançar "The provided value is not of type 'RegisteredTool'".

**Convenções do `executeTool` no Chrome 153 e 154** (confirmadas nas duas; muda entre versões — confira na alvo):

1. O primeiro argumento é o **objeto RegisteredTool** vindo de `getTools()` (re-pegue dentro da página a cada chamada — objetos serializados pelo CDP perdem o tipo) — string com o nome lança `TypeError`.
2. Os argumentos vão como **string JSON**: `executeTool(tool, JSON.stringify(args))`. Objeto puro lança "Failed to parse input arguments" no 153/154 (objeto só válido a partir do 155).

Helper de chamada dentro da página:

```js
const T = (name, args) => cdp.evalJs(`(async () => {
  const t = (await document.modelContext.getTools()).find(t => t.name === ${JSON.stringify(name)});
  return document.modelContext.executeTool(t, JSON.stringify(${JSON.stringify(args)}));
})()`);
```

Respostas das tools vêm como **string** (ex.: `'"pavao" is a valid Tentoo word.'`, `'{"date":...,"won":true,...}'`) — asseire com regex sobre a string (`/"won":true/`), não com `JSON.stringify` de novo (as aspas escapadas quebram o padrão).

Checklist nativo: ferramentas registradas pelo PRÓPRIO site no load (sem mock); `executeTool` de cada ferramenta contra jogo real; rejeição de palavra inválida; vitória completa por ferramenta; stats persistidas por modo; ferramentas sobrevivem a `switch_mode`; zero exceções de página.

**Sequência importa**: `submit_guess` num jogo já finalizado retorna "Game already finished (won)" — para testar rejeição de palavra inválida e vitória por ferramenta, limpe o estado antes (`localStorage.clear()` + reload com query nova).

**Cuidado crítico — janela oculta**: o Chromium pausa animações CSS em janelas ocultas; os `animationend` não disparam e `submit_guess` estoura o `waitForSettle` de 4s. Com `--headless=new` isso não ocorre (janela virtual sempre "visível"). Em Chrome headed, ative a janela antes dos palpites (`osascript -e 'tell application "Google Chrome" to activate'`). Se travou: ao tornar a janela visível a submissão interrompida SE COMPLETA sozinha com estado consistente — recarregue e siga, não é corrupção.

### 5d. Reduced motion

Emule `prefers-reduced-motion: reduce` (stub de `matchMedia` serve) e valide: `Confetti.burst()` não cria canvas; sem a preferência cria; `destroy()` remove. No CSS, `.result-word` cai no keyframe de fade (só opacity).

## 6. Bugs conhecidos — não reporte como novos

- **Toast fantasma**: toast morre visualmente aos 1,8s mas sai do DOM só aos 4s; ocupa espaço e desloca os próximos. Fix: remover o elemento no `animationend` (ou sincronizar o timeout do JS com a animação CSS).
- **Teclado perde as cores ao vencer**: `recomputeKeyboard` (`js/TentooGame.js`) pula boards resolvidos; com todos resolvidos zera as cores das teclas. Cosmético, pós-vitória.

## 7. Limpeza

- Chrome de teste: `pkill -f chrome-tentoo-e2e; rm -rf /tmp/chrome-tentoo-e2e` (o `rm` pode falhar com "Directory not empty" se o processo ainda estiver morrendo — repita) e confirme que o CDP 9222 caiu (`curl -s --max-time 2 http://localhost:9222/json/version`).
- Servidor (`http.server 8123`): encerre com `pkill -f "http.server 8123"` se o usuário não for jogar.
- Relate ao final: matriz executada (✅/❌ por item), bugs novos encontrados, e estado deixado no ambiente.

## 8. Última bateria executada (05/10/2026, Chrome 154 headless)

33/33 UI + 9/9 WebMCP nativo + reduced motion OK + `npm test` 33/33. Base real de validação: commit `83736e0` (fix de overflow do modal). Se uma checagem desta skill falhar numa versão futura do jogo, confira primeiro se o comportamento mudou de propósito.
