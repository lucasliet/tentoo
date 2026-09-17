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

## 3. Protocolo de automação (Browser Use)

Carregue a skill `browser-use:control-browser` e siga-a. Armadilhas específicas deste ambiente, aprendidas a preço de bug:

- Cada chamada `mcp__node_repl__js` roda num kernel fresco: repita o bootstrap e reconecte o browser/tabl em toda célula.
- `tab.playwright.evaluate` exige **função** quando há múltiplas declarações (string com `;` quebra com SyntaxError).
- `await import(...)` DENTRO de `evaluate` não funciona ("importModule is not defined"). Para carregar um módulo ES na página, injete um `<script type="module">` que guarde a classe em `window` e resolva a Promise com um valor **serializável** (resolver com o objeto módulo mata a ponte).
- O pointer probe do backend falha com "no click point" em elementos dentro de overlays criados dinamicamente (botão compartilhar, opções do dropdown). Diagnóstico: `document.elementFromPoint(centro)` — se acerta o elemento, clique via `evaluate(() => el.click())`. Não é bug do site.
- Para ler estado interno do jogo use o hook de teste `window.__tentoo` (`getGame()` / `startGame(mode)`), criado pelo `main.js`.

## 4. Matriz de teste de UI

Valores esperados no modo normal (window ~1280×720): 45 tiles em `#boards-container .tile`, 28 teclas, tooltip de ajuda visível nos primeiros ~3s.

- **Toasts**: leia SEMPRE o último (`document.querySelectorAll('.toast')` → último elemento) e espere ≥2,2s entre toasts — toasts "mortos" continuam no DOM até 4s (bug conhecido, ver plano 001 em `plans/`). Palavra incompleta → "Palavra incompleta"; inexistente → "Palavra repetida ou não encontrada" e a linha NÃO commita (`currentRow` inalterado).
- **Vitória**: digite a palavra do dia no teclado virtual (`.key` cliques ou backspace para limpar). Esperado: `finished/won = true`, tiles da linha vencedora com classe `correct` + `bounce`, `<canvas class="confetti-canvas">` no DOM, stats gravadas (`tentoo_stats`, `tentoo_stats_dueto`, `tentoo_stats_quarteto` — distribution na linha da vitória).
- **Modal de resultado**: vive no overlay criado dinamicamente pelo jogo — NÃO no `#modal-overlay` estático do index.html. Verifique: `.modal-overlay` visível contendo `#share-btn` e `.result-word` com `style="--wi:N"` (stagger 70ms) e classes `win`/`lose`.
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

Instale um mock antes de carregar o serviço e registre via classe importada (ver armadilha de import no passo 3):

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

Lance uma instância ISOLADA (nunca debug no perfil do usuário):

```bash
rm -rf /tmp/chrome-webmcp-test && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir=/tmp/chrome-webmcp-test --remote-debugging-port=9222 \
  --no-first-run --no-default-browser-check --enable-features=WebMCPTesting about:blank
```

Conecte do `mcp__node_repl__js` com o helper (o kernel não expõe `fetch`/`WebSocket` globais):

```bash
mkdir -p /tmp/webmcp-cdp && cd /tmp/webmcp-cdp && npm init -y >/dev/null && npm install ws@8 --no-fund --no-audit
```

…e registre `/tmp/webmcp-cdp/node_modules` com `mcp__node_repl__js_add_node_module_dir`. Então:

```js
const { pathToFileURL } = await import("node:url");
const { connect } = await import(pathToFileURL("/Users/lucas/Projetos/Pessoal/tentoo/.agents/skills/tentoo-e2e/scripts/cdp-connect.mjs").href);
const cdp = await connect({ url: "http://localhost:8123/" });
await cdp.send("Page.navigate", { url: "http://localhost:8123/" });
await cdp.waitForLoad();
const tools = await cdp.evalJs(`(await document.modelContext.getTools()).map(t => t.name)`);
```

**Convenções do `executeTool` no Chrome 153** (confirme na versão alvo; muda entre versões):

1. O primeiro argumento é o **objeto RegisteredTool** vindo de `getTools()` — string com o nome lança `TypeError`.
2. Os argumentos vão como **string JSON**: `executeTool(tool, JSON.stringify(args))`. Objeto puro lança "Failed to parse input arguments" no 153 (objeto só válido a partir do 155).

Helper de chamada dentro da página:

```js
const T = (name, args) => cdp.evalJs(`(async () => {
  const t = (await document.modelContext.getTools()).find(t => t.name === ${JSON.stringify(name)});
  return document.modelContext.executeTool(t, JSON.stringify(${JSON.stringify(args)}));
})()`);
```

Checklist nativo: ferramentas registradas pelo PRÓPRIO site no load (sem mock); `executeTool` de cada ferramenta contra jogo real; vitórias normal/dueto/quarteto por ferramenta com feedback 🟩🟧⬛ correto; stats persistidas por modo; ferramentas sobrevivem a `switch_mode`; zero exceções de página.

**Cuidado crítico — janela oculta**: o Chromium pausa animações CSS em janelas ocultas; os `animationend` não disparam e `submit_guess` estoura o `waitForSettle` de 4s. Ative o Chrome antes dos palpites (`osascript -e 'tell application "Google Chrome" to activate'`). Se travou: ao tornar a janela visível a submissão interrompida SE COMPLETA sozinha com estado consistente — recarregue e siga, não é corrupção.

### 5d. Reduced motion

Emule `prefers-reduced-motion: reduce` (stub de `matchMedia` serve) e valide: `Confetti.burst()` não cria canvas; sem a preferência cria; `destroy()` remove. No CSS, `.result-word` cai no keyframe de fade (só opacity).

## 6. Bugs conhecidos — não reporte como novos

- **Toast fantasma**: toast morre visualmente aos 1,8s mas sai do DOM só aos 4s; ocupa espaço e desloca os próximos. Fix: remover o elemento no `animationend` (ou sincronizar o timeout do JS com a animação CSS).
- **Teclado perde as cores ao vencer**: `recomputeKeyboard` (`js/TentooGame.js`) pula boards resolvidos; com todos resolvidos zera as cores das teclas. Cosmético, pós-vitória.

## 7. Limpeza

- Chrome de teste: `pkill -f chrome-webmcp-test && rm -rf /tmp/chrome-webmcp-test` e confirme que o CDP 9222 caiu.
- Servidor e aba IAB: mantenha rodando/aberta se o usuário for brincar; senão encerre.
- Relate ao final: matriz executada (✅/❌ por item), bugs novos encontrados, e estado deixado no ambiente.
