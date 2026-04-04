import { COLS } from './constants.js';

export class BoardComponent {
  constructor(boardsContainerEl, boardsCount, maxRows) {
    this.boardsContainerEl = boardsContainerEl;
    this.boardsCount = boardsCount;
    this.maxRows = maxRows;
    this.boardsTiles = [];
    this.boardsEls = [];
  }

  buildBoards() {
    this.boardsTiles = [];
    this.boardsEls = [];
    for (let b = 0; b < this.boardsCount; b++) {
      const boardEl = document.createElement('div');
      boardEl.className = 'board';
      boardEl.id = `board-${b}`;

      const tiles = [];
      for (let r = 0; r < this.maxRows; r++) {
        const rowEl = document.createElement('div');
        rowEl.className = 'row';
        const rowTiles = [];
        for (let c = 0; c < COLS; c++) {
          const tile = document.createElement('div');
          tile.className = 'tile';
          rowEl.appendChild(tile);
          rowTiles.push(tile);
        }
        boardEl.appendChild(rowEl);
        tiles.push(rowTiles);
      }
      this.boardsContainerEl.appendChild(boardEl);
      this.boardsEls.push(boardEl);
      this.boardsTiles.push(tiles);
    }
  }

  revealBoardRow(b, result, currentRow) {
    return new Promise(resolve => {
      let revealed = 0;
      result.forEach((state, i) => {
        setTimeout(() => {
          const tile = this.boardsTiles[b][currentRow][i];
          tile.classList.add('flip');
          setTimeout(() => tile.classList.add(state), 250);
          tile.addEventListener('animationend', () => {
            revealed++;
            if (revealed === COLS) resolve();
          }, { once: true });
        }, i * 300);
      });
    });
  }

  bounceBoardRow(b, row) {
    this.boardsTiles[b][row].forEach((t, i) => {
      setTimeout(() => {
        t.classList.add('bounce');
        t.addEventListener('animationend', () => t.classList.remove('bounce'), { once: true });
      }, i * 80);
    });
  }

  shakeRows(boardStatus, currentRow) {
    for (let b = 0; b < this.boardsCount; b++) {
      if (boardStatus[b] && currentRow > 0) continue;
      this.boardsTiles[b][currentRow].forEach(t => {
        t.classList.add('shake');
        t.addEventListener('animationend', () => t.classList.remove('shake'), { once: true });
      });
    }
  }
}
