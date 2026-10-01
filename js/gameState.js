import { getTodayDateString, normalize } from './helpers.js';

const RESULT_EMOJI = { correct: '🟩', present: '🟧', absent: '⬛' };

/** @param {object} game Active TentooGame instance @returns {object} Structured snapshot of the game state */
export function buildGameState(game) {
  if (!game) return null;
  const boards = [];
  for (let b = 0; b < game.boardsCount; b++) {
    const rows = [];
    for (let r = 0; r < game.currentRow; r++) {
      const guess = game.guesses[r].join('');
      const result = game.evaluateGuessForBoard(guess, b);
      rows.push({ guess, feedback: result.map(state => RESULT_EMOJI[state]).join('') });
      if (result.every(state => state === 'correct')) break;
    }
    boards.push({ board: b + 1, solved: game.boardStatus[b], rows });
  }
  return {
    date: getTodayDateString(),
    mode: game.mode,
    finished: game.finished,
    won: game.won,
    currentRow: game.currentRow,
    maxRows: game.maxRows,
    lettersTyped: game.finished ? 0 : game.guesses[game.currentRow].length,
    boards
  };
}

/** @param {object} game @returns {Promise<void>} Resolves once the reveal animation settles */
export function waitForSettle(game) {
  return new Promise(resolve => {
    const started = Date.now();
    const poll = () => {
      if (!game.isAnimating || Date.now() - started > 4000) resolve();
      else setTimeout(poll, 100);
    };
    setTimeout(poll, 200);
  });
}

/**
 * @param {object} game Active TentooGame instance
 * @param {string} rawWord Word to submit, normalized before validation
 * @returns {Promise<boolean>} True when the guess was accepted and committed to the board
 */
export async function submitWord(game, rawWord) {
  if (!game || game.finished || game.isAnimating) return false;
  const word = normalize(String(rawWord || '').trim().toLowerCase());
  if (!/^[a-z]{5}$/.test(word)) return false;
  if (!game.dictionaryService.has(word)) return false;
  while (game.currentCol > 0) game.deleteLetter();
  for (const letter of word) game.addLetter(letter);
  if (game.currentCol < 5) return false;
  game.submitGuess();
  if (!game.isAnimating) return false;
  await waitForSettle(game);
  return !game.isAnimating;
}
