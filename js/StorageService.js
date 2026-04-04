import { STORAGE_KEY, GAME_STATE_KEY } from './constants.js';
import { getTodayDateString } from './helpers.js';

export class StorageService {
  constructor(mode, maxRows) {
    this.storageKeyStats = STORAGE_KEY + (mode === 'normal' ? '' : '_' + mode);
    this.storageKeyGame = GAME_STATE_KEY + (mode === 'normal' ? '' : '_' + mode);
    this.maxRows = maxRows;
  }

  loadStats() {
    const raw = localStorage.getItem(this.storageKeyStats);
    if (raw) return JSON.parse(raw);
    return { played: 0, won: 0, streak: 0, maxStreak: 0, distribution: Array(this.maxRows).fill(0), lastDate: '' };
  }

  saveStats(stats) {
    localStorage.setItem(this.storageKeyStats, JSON.stringify(stats));
  }

  loadGameState() {
    const raw = localStorage.getItem(this.storageKeyGame);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (state.date !== getTodayDateString()) return null;
    return state;
  }

  saveGameState(gameState) {
    localStorage.setItem(this.storageKeyGame, JSON.stringify({
      date: getTodayDateString(),
      ...gameState
    }));
  }
}
