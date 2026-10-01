import { getTodayDateString, gameStateStorageKey } from '../helpers.js';
import { buildGameState, submitWord } from '../gameState.js';
import { JevError, decide } from './jevClient.js';
import {
  buildOptions,
  buildStateText,
  describeOption,
  filterCandidates
} from './solver.js';

const DAILY_ATTEMPT_KEY = 'tentoo_jev_autoplay';
const OPTION_LIMIT = 8;
const GUESS_PAUSE_MS = 400;

/** @returns {boolean} True when today's Jev attempt has not been used on this device */
function attemptAvailable() {
  try {
    const used = JSON.parse(localStorage.getItem(DAILY_ATTEMPT_KEY) || 'null');
    return !(used && used.date === getTodayDateString());
  } catch {
    return true;
  }
}

function markAttemptUsed() {
  localStorage.setItem(DAILY_ATTEMPT_KEY, JSON.stringify({ date: getTodayDateString() }));
}

/** @returns {Promise<void>} Small pause between guesses for pacing */
function pause() {
  return new Promise(resolve => setTimeout(resolve, GUESS_PAUSE_MS));
}

/** @param {object} state Serialized game state @param {string[]} wordlist @returns {{ pools: Record<number, string[]>, triedWords: Set<string>, triedLetters: Set<string> }} Solver inputs derived from the state */
function solverInputs(state, wordlist) {
  const pools = {};
  const triedWords = new Set();
  const triedLetters = new Set();
  state.boards.forEach((board, index) => {
    if (board.solved) return;
    pools[index] = filterCandidates(wordlist, board.rows);
    for (const row of board.rows) {
      triedWords.add(row.guess);
      for (const letter of row.guess) triedLetters.add(letter);
    }
  });
  return { pools, triedWords, triedLetters };
}

/** @param {object} game Active TentooGame instance @param {string[]} wordlist @returns {Promise<void>} Plays the whole game with Jev decisions */
async function playGame(game, wordlist) {
  while (!game.finished) {
    const state = buildGameState(game);
    const { pools, triedWords, triedLetters } = solverInputs(state, wordlist);
    const boardIndexes = Object.keys(pools);
    if (boardIndexes.length === 0) break;
    if (boardIndexes.some(index => pools[index].length === 0)) {
      throw new JevError('nenhuma palavra do dicionário casa com o feedback');
    }
    const attemptsLeft = state.maxRows - state.currentRow;
    const optionWords = buildOptions(pools, OPTION_LIMIT, triedWords, attemptsLeft);
    let word;
    if (optionWords.length === 1) {
      word = optionWords[0];
    } else {
      const options = optionWords.map(candidate => [candidate, describeOption(candidate, pools, triedLetters)]);
      const decision = await decide(buildStateText(state, pools, options), options);
      word = decision.word;
    }
    game.isJevGame = true;
    const accepted = await submitWord(game, word);
    if (!accepted) throw new JevError(`o palpite ${word} foi rejeitado`);
    await pause();
  }
  game.showToast(game.won ? '🤖 O Jev venceu!' : '🤖 O Jev perdeu');
}

/** @param {object} game Game that received the trigger @param {(mode: string) => void} startGame Rebuilds the game for a mode @param {() => object} getGame Returns the active game instance */
async function handleTrigger(game, startGame, getGame) {
  if (!game || game.jevPlaying) return;
  if (!attemptAvailable()) {
    game.showToast('O Jev já usou a tentativa de hoje');
    return;
  }
  if (!game.dictionaryService.words.length) {
    game.showToast('O Jev não conseguiu carregar o dicionário');
    return;
  }
  const wordlist = game.dictionaryService.words;
  const mode = game.mode;
  markAttemptUsed();
  localStorage.removeItem(gameStateStorageKey(mode));
  startGame(mode);
  const fresh = getGame();
  if (!fresh) return;
  fresh.jevPlaying = true;
  fresh.showToast('🤖 O Jev assumiu o jogo');
  try {
    await playGame(fresh, wordlist);
  } catch (error) {
    fresh.showToast(`🤖 O Jev não conseguiu continuar: ${error.message}`);
  } finally {
    fresh.jevPlaying = false;
  }
}

/** @param {{ startGame: (mode: string) => void, getGame: () => object }} hooks Game lifecycle accessors */
export function initJevAutoplay({ startGame, getGame }) {
  document.addEventListener('tentoo:jev-trigger', async event => {
    const game = event.detail?.game || getGame();
    await handleTrigger(game, startGame, getGame);
  });
}
