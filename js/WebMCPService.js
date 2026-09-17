import { MODES_CONFIG } from './constants.js';
import { normalize, getTodayDateString } from './helpers.js';
import { StorageService } from './StorageService.js';

const RESULT_EMOJI = { correct: '🟩', present: '🟧', absent: '⬛' };

export class WebMCPService {
  /** @param {{ getGame: () => object, startMode: (mode: string) => void }} hooks Accessors for the live game and mode switching */
  constructor({ getGame, startMode }) {
    this.getGame = getGame;
    this.startMode = startMode;
  }

  /** @returns {Promise<boolean>} True when every tool was registered successfully */
  async init() {
    if (!('modelContext' in document)) {
      console.info('WebMCP not available in this browser; tools not registered.');
      return false;
    }
    const tools = [
      this.gameStateTool(),
      this.submitGuessTool(),
      this.checkWordTool(),
      this.statsTool(),
      this.switchModeTool()
    ];
    let registered = 0;
    for (const tool of tools) {
      try {
        await document.modelContext.registerTool(tool);
        registered++;
      } catch (error) {
        console.error(`WebMCP: failed to register tool "${tool.name}":`, error);
      }
    }
    return registered === tools.length;
  }

  /** @returns {object} Tool definition for reading the full game state */
  gameStateTool() {
    return {
      name: 'get_game_state',
      description: 'Get the full Tentoo game state: active mode, every board with its guessed rows and colored feedback, current row, and whether the game is finished or won.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: async () => this.serializeState(this.getGame())
    };
  }

  /** @returns {object} Tool definition for submitting a word guess */
  submitGuessTool() {
    return {
      name: 'submit_guess',
      description: 'Submit a 5-letter Portuguese word guess in Tentoo. Returns the colored feedback (🟩 correct, 🟧 present, ⬛ absent) for every board after the reveal animation. Words must exist in the game dictionary.',
      inputSchema: {
        type: 'object',
        properties: {
          word: { type: 'string', minLength: 5, maxLength: 5, description: 'The word to guess, e.g. "carta"' }
        },
        required: ['word']
      },
      execute: async ({ word }) => this.submitGuess(word)
    };
  }

  /** @returns {object} Tool definition for dictionary lookups */
  checkWordTool() {
    return {
      name: 'check_word',
      description: 'Check whether a 5-letter Portuguese word exists in the Tentoo dictionary (accepted guesses).',
      inputSchema: {
        type: 'object',
        properties: {
          word: { type: 'string', description: 'The word to check, e.g. "pedra"' }
        },
        required: ['word']
      },
      annotations: { readOnlyHint: true },
      execute: async ({ word }) => {
        const game = this.getGame();
        const normalized = normalize(String(word || '').trim().toLowerCase());
        if (!/^[a-z]{5}$/.test(normalized)) return `"${word}" is not a 5-letter word.`;
        const accepted = game ? game.dictionaryService.has(normalized) : false;
        return accepted ? `"${normalized}" is a valid Tentoo word.` : `"${normalized}" is NOT in the Tentoo dictionary.`;
      }
    };
  }

  /** @returns {object} Tool definition for reading per-mode statistics */
  statsTool() {
    return {
      name: 'get_stats',
      description: 'Get Tentoo statistics (games played, win rate, streak, best streak, guess distribution) for a game mode. Defaults to the active mode.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['normal', 'dueto', 'quarteto'], description: 'Game mode to read stats from' }
        }
      },
      annotations: { readOnlyHint: true },
      execute: async ({ mode } = {}) => {
        const game = this.getGame();
        const target = mode && MODES_CONFIG[mode] ? mode : (game ? game.mode : 'normal');
        const stats = new StorageService(target, MODES_CONFIG[target].rows).loadStats();
        return JSON.stringify({ mode: target, ...stats });
      }
    };
  }

  /** @returns {object} Tool definition for switching game mode */
  switchModeTool() {
    return {
      name: 'switch_mode',
      description: 'Switch the Tentoo game mode. Normal has 1 board and 6 rows, Dueto has 2 boards and 7 rows, Quarteto has 4 boards and 9 rows. Switching discards the current in-progress game.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['normal', 'dueto', 'quarteto'], description: 'The mode to switch to' }
        },
        required: ['mode']
      },
      execute: async ({ mode }) => {
        if (!MODES_CONFIG[mode]) return `Unknown mode "${mode}".`;
        this.startMode(mode);
        return `Switched to ${mode} mode: ${MODES_CONFIG[mode].boards} board(s), ${MODES_CONFIG[mode].rows} rows.`;
      }
    };
  }

  /** @param {object} game @returns {string} JSON snapshot of the live game state */
  serializeState(game) {
    if (!game) return 'No active game.';
    const boards = [];
    for (let b = 0; b < game.boardsCount; b++) {
      const rows = [];
      for (let r = 0; r < game.currentRow; r++) {
        const guess = game.guesses[r].join('');
        const result = game.evaluateGuessForBoard(guess, b);
        rows.push({ guess, feedback: result.map(s => RESULT_EMOJI[s]).join('') });
        if (result.every(s => s === 'correct')) break;
      }
      boards.push({ board: b + 1, solved: game.boardStatus[b], rows });
    }
    return JSON.stringify({
      date: getTodayDateString(),
      mode: game.mode,
      finished: game.finished,
      won: game.won,
      currentRow: game.currentRow,
      maxRows: game.maxRows,
      lettersTyped: game.finished ? 0 : game.guesses[game.currentRow].length,
      boards
    });
  }

  /** @param {string} rawWord @returns {Promise<string>} Submission outcome with board feedback */
  async submitGuess(rawWord) {
    const game = this.getGame();
    if (!game) return 'No active game.';
    if (game.finished) return `Game already finished (${game.won ? 'won' : 'lost'}). Use switch_mode to play another mode, or come back tomorrow.`;
    if (game.isAnimating) return 'The board is still revealing the previous guess. Wait a moment and try again.';
    const word = normalize(String(rawWord || '').trim().toLowerCase());
    if (!/^[a-z]{5}$/.test(word)) return 'Invalid word: provide exactly 5 letters (accents are normalized automatically).';
    if (!game.dictionaryService.has(word)) return `"${word}" is not in the Tentoo dictionary.`;

    while (game.currentCol > 0) game.deleteLetter();
    for (const letter of word) game.addLetter(letter);
    game.submitGuess();
    await this.waitForSettle(game);
    if (game.isAnimating) return 'Submission timed out waiting for the reveal; call get_game_state to check the result.';
    return `Guess "${word}" submitted.\n${this.serializeState(game)}`;
  }

  /** @param {object} game @returns {Promise<void>} Resolves once reveal animations settle */
  waitForSettle(game) {
    return new Promise(resolve => {
      const started = Date.now();
      const poll = () => {
        if (!game.isAnimating || Date.now() - started > 4000) resolve();
        else setTimeout(poll, 100);
      };
      setTimeout(poll, 200);
    });
  }
}
