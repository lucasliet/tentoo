# Tentoo

Tentoo é uma versão do popular jogo de palavras diário (semelhante ao Termo/Wordle). O jogo foi desenvolvido com alta fidelidade às lógicas originais e focado em proporcionar uma experiência de interface moderna, limpa e responsiva.

## 🌟 Funcionalidades

- **Jogabilidade Clássica:** Descubra a palavra certa de 5 letras em até 6 tentativas. As cores ilustrarão o quão próximo você está.
- **Normalização Dinâmica:** Suporte completo a acentos tanto no teclado virtual quanto ao jogar com o teclado físico, garantindo que "A" seja lido como "Á" automaticamente quando necessário para a resolução da palavra.
- **Lógica de Dias Real:** Assim como o jogo clássico, o Tentoo seleciona a Palavra do Dia com base na quantidade exata de dias desde a data original de 02 de Janeiro de 2022, garantindo pareamento absoluto na seleção cronológica de palavras.
- **Dicionário Atualizado:** Seleção cirúrgica com milhares de substantivos e verbos da língua portuguesa sem plurais soltos.
- **Modal de Instruções Completo:** Modal animado e dinâmico sobre "Como Jogar" e as regras, respeitando a elegância do tema.
- **Experiência Visual Imersiva:** Paleta de cores em *dark mode* azulado e profundo (`#040d1a`), oferecendo um layout Premium e relaxante.

## 🛠 Tecnologias

O projeto é puramente Front-end sem dependência de build steps.

- **HTML5:** Estruturação semântica
- **Vanilla CSS3:** Variáveis de design system nativas (`:root`), flexbox e suporte a `clamp` para telas menores em 640px de altura.
- **Vanilla JavaScript:** Toda a manipulação do DOM e lógicas de sincronização temporal.

## 📂 Como executar o jogo localmente

O projeto não demanda ferramentas como npm install ou node. Porém, certas funcionalidades (como carregar modulares) podem ser bloqueadas pelo CORS local por usar esquema `file://`. A recomendação é servir sua pasta estaticamente.

```bash
# Navegue até a pasta do projeto
cd termoo-clone

# Sirva na porta desejada com npx
npx -y http-server . -p 8080 -c-1
```
Em seguida, abra `http://localhost:8080` no seu navegador favorito.

## 💾 Persistência de Dados

O Tentoo grava as informações de progresso do usuário (jogadas e estado do tabuleiro atual) de forma inofensiva no `localStorage` sob a chave base `tentoo_game_state` e estatísticas sob `tentoo_stats`. Seu jogo fica salvo caso recarregue o navegador acidentalmente.

---
Feito com dedicação. Divirta-se tentando adivinhar as palavras!
