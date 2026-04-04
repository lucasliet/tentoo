import { COLS, MODES_CONFIG } from './constants.js';
import { normalize, getTodayDateString, getWordsForMode } from './helpers.js';
import { StorageService } from './StorageService.js';
import { BoardComponent } from './BoardComponent.js';

export class TentooGame {
  constructor(mode, dictionaryService, WORDS, DUETO_INDEXES, QUARTETO_INDEXES) {
    this.mode = mode;
    this.dictionaryService = dictionaryService;
    this.WORDS = WORDS;
    this.DUETO_INDEXES = DUETO_INDEXES;
    this.QUARTETO_INDEXES = QUARTETO_INDEXES;

    const wordsObj = getWordsForMode(mode, WORDS, DUETO_INDEXES, QUARTETO_INDEXES);
    this.wordsOriginal = wordsObj.original;
    this.words = wordsObj.normalized;
    this.termooDebug = wordsObj.termooDebug;

    const config = MODES_CONFIG[mode];
    this.boardsCount = config.boards;
    this.maxRows = config.rows;

    this.guesses = Array.from({ length: this.maxRows }, () => []);
    this.currentRow = 0;
    this.currentCol = 0;

    this.boardStatus = Array(this.boardsCount).fill(false);
    this.finished = false;
    this.won = false;
    this.keyStates = {};
    this.isAnimating = false;

    this.boardsContainerEl = document.getElementById('boards-container');
    this.keyboardEl = document.getElementById('keyboard');
    this.toastContainer = document.getElementById('toast-container');

    this.resultOverlay = document.createElement('div');
    this.resultOverlay.className = 'modal-overlay hidden';
    this.resultOverlay.innerHTML = '<div class="modal"><button class="modal-close">&times;</button><div class="result-content"></div></div>';
    document.body.appendChild(this.resultOverlay);
    this.resultContent = this.resultOverlay.querySelector('.result-content');
    this.resultCloseBtn = this.resultOverlay.querySelector('.modal-close');

    this.storage = new StorageService(mode, this.maxRows);

    this.boardsContainerEl.innerHTML = '';
    this.keyboardEl.innerHTML = '';

    document.body.className = '';
    if (mode !== 'normal') document.body.classList.add(`mode-${mode}`);

    this.board = new BoardComponent(this.boardsContainerEl, this.boardsCount, this.maxRows);
    this.board.buildBoards();
    this.boardsTiles = this.board.boardsTiles;
    this.boardsEls = this.board.boardsEls;

    this.keys = {};
    this.buildKeyboard();
    this.bindEvents();
    this.restoreGameState();
  }

  buildKeyboard() {
    const KEYBOARD_LAYOUT = [
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
      ['enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace']
    ];
    this.keys = {};
    KEYBOARD_LAYOUT.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'keyboard-row';
      row.forEach(key => {
        const btn = document.createElement('button');
        btn.className = 'key';
        if (key === 'enter') { btn.textContent = 'Enter'; btn.classList.add('wide'); }
        else if (key === 'backspace') { btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 4l-7 8 7 8h14V4H9z"/><line x1="15" y1="9" x2="11" y2="15"/><line x1="11" y1="9" x2="15" y2="15"/></svg>`; btn.classList.add('wide'); }
        else { btn.textContent = key; }
        btn.addEventListener('click', () => this.handleKey(key));
        rowEl.appendChild(btn);
        this.keys[key] = btn;
      });
      this.keyboardEl.appendChild(rowEl);
    });
  }

  bindEvents() {
    this.keyHandler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Enter') { e.preventDefault(); this.handleKey('enter'); }
      else if (e.key === 'Backspace') { e.preventDefault(); this.handleKey('backspace'); }
      else {
        let keyChar = e.key.toLowerCase();
        if (/^[a-záéíóúâêôãõç]$/.test(keyChar)) this.handleKey(normalize(keyChar));
      }
    };
    document.addEventListener('keydown', this.keyHandler);

    this.resultCloseBtn.addEventListener('click', () => this.resultOverlay.classList.add('hidden'));
    this.resultOverlay.addEventListener('click', (e) => { if (e.target === this.resultOverlay) this.resultOverlay.classList.add('hidden'); });
  }

  destroy() {
    document.removeEventListener('keydown', this.keyHandler);
    this.resultOverlay.remove();
  }

  loadStats() { return this.storage.loadStats(); }
  saveStats(stats) { this.storage.saveStats(stats); }

  saveGameState() {
    this.storage.saveGameState({
      guesses: this.guesses,
      currentRow: this.currentRow,
      finished: this.finished,
      won: this.won,
      boardStatus: this.boardStatus
    });
  }

  evaluateGuessForBoard(guess, boardIndex) {
    const target = this.words[boardIndex];
    const result = Array(COLS).fill('absent');
    const targetLetters = target.split('');
    const guessLetters = guess.split('');

    guessLetters.forEach((letter, i) => {
      if (letter === targetLetters[i]) {
        result[i] = 'correct';
        targetLetters[i] = null;
      }
    });

    guessLetters.forEach((letter, i) => {
      if (result[i] !== 'correct') {
        const idx = targetLetters.indexOf(letter);
        if (idx !== -1) {
          result[i] = 'present';
          targetLetters[idx] = null;
        }
      }
    });
    return result;
  }

  restoreGameState() {
    if (this.mode === 'normal') {
      setTimeout(() => {
        const tooltip = document.getElementById('help-tooltip');
        if (tooltip) {
          tooltip.classList.remove('hidden');
          setTimeout(() => tooltip.classList.add('hidden'), 3000);
        }
      }, 100);
    }

    const saved = this.storage.loadGameState();
    if (!saved) return;

    this.currentRow = saved.currentRow;
    this.finished = saved.finished;
    this.won = saved.won;
    this.guesses = saved.guesses;
    this.boardStatus = saved.boardStatus || Array(this.boardsCount).fill(false);

    for (let r = 0; r < saved.guesses.length; r++) {
      const guess = saved.guesses[r];
      if (!guess.length) continue;
      const strGuess = guess.join('');

      for (let b = 0; b < this.boardsCount; b++) {
        for (let c = 0; c < guess.length; c++) {
          const tile = this.boardsTiles[b][r][c];
          tile.textContent = guess[c];
          tile.classList.add('filled');
        }
        if (r < this.currentRow) {
          const result = this.evaluateGuessForBoard(strGuess, b);
          for (let c = 0; c < COLS; c++) {
            this.boardsTiles[b][r][c].classList.add(result[c]);
          }
        }
      }
    }

    for (let b = 0; b < this.boardsCount; b++) {
      if (this.boardStatus[b]) this.boardsEls[b].classList.add('finished');
    }

    this.currentCol = this.finished ? 0 : (this.guesses[this.currentRow]?.length || 0);

    if (this.currentRow > 0) this.recomputeKeyboard();

    if (this.finished) setTimeout(() => this.showEndScreen(), 600);
  }

  handleKey(key) {
    if (this.finished || this.isAnimating) return;
    if (key === 'enter') this.submitGuess();
    else if (key === 'backspace') this.deleteLetter();
    else this.addLetter(key);
  }

  addLetter(letter) {
    if (this.currentCol >= COLS) return;
    this.guesses[this.currentRow][this.currentCol] = letter;
    for (let b = 0; b < this.boardsCount; b++) {
      if (this.boardStatus[b] && this.currentRow > 0) continue;
      const tile = this.boardsTiles[b][this.currentRow][this.currentCol];
      tile.textContent = letter;
      tile.classList.add('filled');
    }
    this.currentCol++;
  }

  deleteLetter() {
    if (this.currentCol <= 0) return;
    this.currentCol--;
    this.guesses[this.currentRow].length = this.currentCol;
    for (let b = 0; b < this.boardsCount; b++) {
      if (this.boardStatus[b] && this.currentRow > 0) continue;
      const tile = this.boardsTiles[b][this.currentRow][this.currentCol];
      tile.textContent = '';
      tile.classList.remove('filled');
    }
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    this.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  recomputeKeyboard() {
    this.keyStates = {};
    const priority = { correct: 3, present: 2, absent: 1, undefined: 0 };

    for (let r = 0; r < this.currentRow; r++) {
      const g = this.guesses[r].join('');
      for (let b = 0; b < this.boardsCount; b++) {
        if (this.boardStatus[b]) continue;
        const res = this.evaluateGuessForBoard(g, b);
        for (let c = 0; c < COLS; c++) {
          const letter = g[c];
          const curr = priority[this.keyStates[letter]] || 0;
          if (priority[res[c]] > curr) this.keyStates[letter] = res[c];
        }
      }
    }

    Object.keys(this.keys).forEach(k => {
      const keyEl = this.keys[k];
      keyEl.classList.remove('correct', 'present', 'absent');
      if (this.keyStates[k]) keyEl.classList.add(this.keyStates[k]);
    });
  }

  submitGuess() {
    if (this.currentCol < COLS) {
      this.board.shakeRows(this.boardStatus, this.currentRow);
      this.showToast('Palavra incompleta');
      return;
    }
    const strGuess = this.guesses[this.currentRow].join('');
    if (!this.dictionaryService.has(strGuess)) {
      this.board.shakeRows(this.boardStatus, this.currentRow);
      this.showToast('Palavra repetida ou não encontrada');
      return;
    }

    this.isAnimating = true;
    const animations = [];

    for (let b = 0; b < this.boardsCount; b++) {
      if (this.boardStatus[b]) continue;
      const result = this.evaluateGuessForBoard(strGuess, b);
      animations.push(this.board.revealBoardRow(b, result, this.currentRow));
    }

    Promise.all(animations).then(() => {
      this.isAnimating = false;
      let allWon = true;

      for (let b = 0; b < this.boardsCount; b++) {
        if (this.boardStatus[b]) continue;
        const result = this.evaluateGuessForBoard(strGuess, b);
        const isCorrect = result.every(r => r === 'correct');
        if (isCorrect) {
          this.boardStatus[b] = true;
          this.boardsEls[b].classList.add('finished');
          this.board.bounceBoardRow(b, this.currentRow);
        }
        if (!this.boardStatus[b]) allWon = false;
      }

      this.currentRow++;
      this.recomputeKeyboard();

      if (allWon) {
        this.finished = true;
        this.won = true;
        this.saveGameState();

        const stats = this.loadStats();
        stats.played++; stats.won++; stats.distribution[this.currentRow - 1]++;
        stats.lastDate = getTodayDateString();
        const y = new Date(); y.setDate(y.getDate() - 1);
        stats.streak = stats.lastDate === y.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }) || stats.streak > 0 ? stats.streak + 1 : 1;
        stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
        this.saveStats(stats);

        setTimeout(() => this.showEndScreen(), 1200);
      } else if (this.currentRow >= this.maxRows) {
        this.finished = true;
        this.won = false;
        this.saveGameState();
        const stats = this.loadStats();
        stats.played++; stats.streak = 0; stats.lastDate = getTodayDateString();
        this.saveStats(stats);
        setTimeout(() => this.showEndScreen(), 800);
      } else {
        this.currentCol = 0;
        this.saveGameState();
      }
    });
  }

  showEndScreen() {
    const stats = this.loadStats();
    const maxDist = Math.max(...stats.distribution, 1);
    const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

    let wordsHtml = '';
    this.wordsOriginal.forEach(w => wordsHtml += `<div class="result-word ${this.won ? 'win' : 'lose'}">${w}</div>`);

    let html = `
      <div class="result-section" style="border:none; padding-top:0; margin-bottom:20px; text-align:center;">
        <div style="display:flex; gap:16px; justify-content:center; flex-wrap:wrap; margin-bottom:12px;">${wordsHtml}</div>
        <div class="result-message">${this.won ? `Sensacional! Completo em ${this.currentRow} tentativa(s).` : 'Não foi dessa vez! Volte amanhã.'}</div>
      </div>
      <div class="stats-title">Estatísticas - ${this.mode.toUpperCase()}</div>
      <div class="stats-grid">
        <div class="stat-item"><div class="stat-value">${stats.played}</div><div class="stat-label">Jogos</div></div>
        <div class="stat-item"><div class="stat-value">${winRate}</div><div class="stat-label">% Vitória</div></div>
        <div class="stat-item"><div class="stat-value">${stats.streak}</div><div class="stat-label">Sequência</div></div>
        <div class="stat-item"><div class="stat-value">${stats.maxStreak}</div><div class="stat-label">Melhor Seq.</div></div>
      </div>
      <div class="distribution-title">Distribuição</div>
      <div class="distribution">
        ${stats.distribution.map((count, i) => `<div class="dist-row"><div class="dist-label">${i + 1}</div><div class="dist-bar ${this.won && i === this.currentRow - 1 ? 'highlight' : ''}" style="width: ${Math.max(8, (count / maxDist) * 100)}%">${count}</div></div>`).join('')}
      </div>
      <div class="result-section">
        <button class="share-btn" id="share-btn">Compartilhar</button>
      </div>
    `;

    this.resultContent.innerHTML = html;
    this.resultOverlay.classList.remove('hidden');
    document.getElementById('share-btn').addEventListener('click', () => this.shareResult());
  }

  showStats() {
    if (this.finished) { this.showEndScreen(); return; }
    const stats = this.loadStats();
    const maxDist = Math.max(...stats.distribution, 1);
    const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

    let html = `
      <div class="stats-title">Estatísticas - ${this.mode.toUpperCase()}</div>
      <div class="stats-grid">
        <div class="stat-item"><div class="stat-value">${stats.played}</div><div class="stat-label">Jogos</div></div>
        <div class="stat-item"><div class="stat-value">${winRate}</div><div class="stat-label">% Vitória</div></div>
        <div class="stat-item"><div class="stat-value">${stats.streak}</div><div class="stat-label">Sequência</div></div>
        <div class="stat-item"><div class="stat-value">${stats.maxStreak}</div><div class="stat-label">Melhor Seq.</div></div>
      </div>
      <div class="distribution-title">Distribuição</div>
      <div class="distribution">
        ${stats.distribution.map((count, i) => `<div class="dist-row"><div class="dist-label">${i + 1}</div><div class="dist-bar" style="width: ${Math.max(8, (count / maxDist) * 100)}%">${count}</div></div>`).join('')}
      </div>
    `;
    this.resultContent.innerHTML = html;
    this.resultOverlay.classList.remove('hidden');
  }

  shareResult() {
    const emojiMap = { correct: '🟩', present: '🟧', absent: '⬛' };
    let text = `Tentoo ${getTodayDateString()} ${this.won ? this.currentRow : 'X'}/${this.maxRows}`;
    if (this.mode !== 'normal') text += ` [${this.mode.toUpperCase()}]`;
    text += `\n\n`;

    for (let b = 0; b < this.boardsCount; b++) {
      for (let r = 0; r < this.currentRow; r++) {
        const strGuess = this.guesses[r].join('');
        const res = this.evaluateGuessForBoard(strGuess, b);
        text += res.map(s => emojiMap[s]).join('') + '\n';
        if (this.boardStatus[b] && res.every(x => x === 'correct')) break;
      }
      text += '\n';
    }
    text += 'https://tentoo.pages.dev';
    navigator.clipboard.writeText(text.trim()).then(() => this.showToast('Copiado!')).catch(() => this.showToast('Erro'));
  }
}
