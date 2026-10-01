import { test } from 'node:test';
import assert from 'node:assert/strict';

import { initJevAutoplay } from '../js/jev/autoplay.js';
import { getTodayDateString } from '../js/helpers.js';

const STATE_KEY = 'tentoo_game_state_quarteto';
const DAILY_KEY = 'tentoo_jev_autoplay';
const PREVIOUS_STATE = JSON.stringify({ date: '01/10/2026', guesses: [['s', 'o', 'r', 't', 'e']] });

function createStubGame(options = {}) {
  const { mode = 'quarteto', outcomes = ['win'] } = options;
  const game = {
    mode,
    maxRows: 9,
    boardsCount: 4,
    finished: false,
    won: false,
    isAnimating: false,
    isJevGame: false,
    jevPlaying: false,
    currentRow: 0,
    currentCol: 0,
    guesses: Array.from({ length: 9 }, () => []),
    boardStatus: Array(4).fill(false),
    dictionaryService: {
      has: () => true,
      words: ['abrir', 'horta', 'farsa', 'vidro', 'corta', 'areio', 'abriu', 'spray']
    },
    toasts: [],
    showToast(message) {
      game.toasts.push(message);
    },
    deleteLetter() {
      if (game.currentCol > 0) {
        game.currentCol--;
        game.guesses[game.currentRow].length = game.currentCol;
      }
    },
    addLetter(letter) {
      if (game.currentCol < 5) {
        game.guesses[game.currentRow][game.currentCol] = letter;
        game.currentCol++;
      }
    },
    evaluateGuessForBoard() {
      return Array(5).fill('correct');
    },
    submitGuess() {
      const outcome = outcomes[game.currentRow] ?? 'accept';
      if (outcome === 'reject') return;
      game.isAnimating = true;
      setTimeout(() => {
        game.isAnimating = false;
        game.currentRow++;
        if (outcome === 'win' || game.currentRow >= game.maxRows) {
          game.finished = true;
          game.won = outcome === 'win';
        }
      }, 10);
    }
  };
  return game;
}

function createHarness({ outcomes, fetchStub, startGameSpy }) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  let active = null;
  let startGameCalls = 0;
  const startGame = mode => {
    startGameCalls++;
    startGameSpy?.(mode);
    active = createStubGame({ mode, outcomes });
  };
  const getGame = () => active;
  let triggerHandler = null;
  globalThis.document = {
    addEventListener(type, handler) {
      if (type === 'tentoo:jev-trigger') triggerHandler = handler;
    }
  };
  initJevAutoplay({ startGame, getGame });
  return {
    store,
    get active() {
      return active;
    },
    startGame,
    startGameCalls: () => startGameCalls,
    trigger: async game => {
      await triggerHandler({ detail: { game } });
    },
    cleanup() {
      globalThis.fetch = originalFetch;
      delete globalThis.document;
      delete globalThis.localStorage;
    }
  };
}

function choosingFirstOptionFetch() {
  const stub = async (url, init) => {
    stub.calls = (stub.calls || 0) + 1;
    const body = JSON.parse(init.body);
    return new Response(JSON.stringify({ word: body.options[0].word, probabilities: {}, confidence: null }), { status: 200 });
  };
  return stub;
}

test('shouldPlayGameToVictoryAndMarkDailyAttempt', async () => {
  const fetchStub = choosingFirstOptionFetch();
  const harness = createHarness({ outcomes: ['accept', 'win'], fetchStub });
  try {
    const game = createStubGame({ outcomes: ['accept', 'win'] });
    await harness.trigger(game);
    assert.equal(fetchStub.calls, 1, 'second guess comes from a single-candidate pool');
    assert.deepEqual(JSON.parse(harness.store.get(DAILY_KEY)), { date: getTodayDateString() });
    assert.equal(harness.active.isJevGame, true);
    assert.ok(harness.active.toasts.includes('🤖 O Jev venceu!'));
  } finally {
    harness.cleanup();
  }
});

test('shouldRestorePreviousStateWhenJevFailsBeforeFirstGuess', async () => {
  const harness = createHarness({
    outcomes: ['accept', 'win'],
    fetchStub: async () => {
      throw new TypeError('fetch failed');
    }
  });
  try {
    harness.store.set(STATE_KEY, PREVIOUS_STATE);
    const game = createStubGame();
    await harness.trigger(game);

    const errorToast = harness.active.toasts.find(text => text.includes('não consegui falar'));
    assert.ok(errorToast, 'should toast the Jev error on the restored game');
    assert.ok(errorToast.includes('restaurado'), 'should tell the user the previous game was restored');
    assert.equal(harness.store.get(STATE_KEY), PREVIOUS_STATE, 'previous game state should be restored');
    assert.equal(harness.store.has(DAILY_KEY), false, 'daily attempt should not be burned');
  } finally {
    harness.cleanup();
  }
});

test('shouldKeepAttemptBurnedWhenJevFailsMidGame', async () => {
  const fetchStub = choosingFirstOptionFetch();
  const harness = createHarness({ outcomes: ['accept', 'reject'], fetchStub });
  try {
    harness.store.set(STATE_KEY, PREVIOUS_STATE);
    const game = createStubGame({ outcomes: ['accept', 'reject'] });
    await harness.trigger(game);

    assert.equal(fetchStub.calls, 1);
    assert.deepEqual(JSON.parse(harness.store.get(DAILY_KEY)), { date: getTodayDateString() });
    assert.equal(harness.store.has(STATE_KEY), false, 'mid-game failure should not restore the old board');
    assert.ok(harness.active.toasts.some(text => text.includes('não conseguiu continuar')));
  } finally {
    harness.cleanup();
  }
});

test('shouldAbortSilentlyWhenGameIsSwitchedDuringAutoplay', async () => {
  const fetchStub = choosingFirstOptionFetch();
  let active = null;
  let calls = 0;
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  let triggerHandler = null;
  globalThis.document = {
    addEventListener(type, handler) {
      if (type === 'tentoo:jev-trigger') triggerHandler = handler;
    }
  };
  initJevAutoplay({
    startGame: () => {
      active = createStubGame({ outcomes: ['accept', 'win'] });
    },
    getGame: () => {
      calls++;
      return calls <= 1 ? active : createStubGame({ mode: 'dueto' });
    }
  });
  try {
    store.set(STATE_KEY, PREVIOUS_STATE);
    const game = createStubGame({ outcomes: ['accept', 'win'] });
    await triggerHandler({ detail: { game } });

    assert.equal(fetchStub.calls, undefined, 'no Jev call should happen for an orphaned game');
    assert.equal(store.has(DAILY_KEY), false, 'daily attempt should not be burned');
    assert.ok(!game.toasts.some(text => text.includes('O Jev venceu')), 'orphan should not toast');
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.document;
    delete globalThis.localStorage;
  }
});

test('shouldRefuseTriggerWhenDailyAttemptWasAlreadyUsed', async () => {
  const fetchStub = choosingFirstOptionFetch();
  const harness = createHarness({ outcomes: ['win'], fetchStub });
  try {
    harness.store.set(DAILY_KEY, JSON.stringify({ date: getTodayDateString() }));
    const game = createStubGame();
    await harness.trigger(game);

    assert.equal(harness.startGameCalls(), 0);
    assert.equal(fetchStub.calls, undefined);
    assert.ok(game.toasts.includes('O Jev já usou a tentativa de hoje'));
  } finally {
    harness.cleanup();
  }
});

test('shouldNotRebuildOldModeWhenUserSwitchedAwayDuringPendingFailure', async () => {
  // Given
  let rejectFetch;
  const harness = createHarness({
    outcomes: ['accept', 'win'],
    fetchStub: () => new Promise((resolve, reject) => {
      rejectFetch = reject;
    })
  });
  try {
    harness.store.set(STATE_KEY, PREVIOUS_STATE);
    const triggerPromise = harness.trigger(createStubGame());
    await new Promise(resolve => setTimeout(resolve, 50));
    harness.startGame('dueto');
    const switchedTo = harness.active;
    rejectFetch(new TypeError('fetch failed'));
    await triggerPromise;

    // Then
    assert.equal(harness.store.get(STATE_KEY), PREVIOUS_STATE, 'storage should still be restored');
    assert.equal(harness.startGameCalls(), 2, 'catch must not rebuild the abandoned mode');
    assert.equal(harness.active, switchedTo, 'user stays on the mode they switched to');
    assert.ok(harness.active.toasts.some(text => text.includes('restaurado')));
  } finally {
    harness.cleanup();
  }
});
