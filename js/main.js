import { WORDS, DUETO_INDEXES, QUARTETO_INDEXES } from './constants.js';
import { DictionaryService } from './DictionaryService.js';
import { TentooGame } from './TentooGame.js';

let currentGame = null;

document.addEventListener('DOMContentLoaded', async () => {
  const dictionaryService = new DictionaryService();
  dictionaryService.initFromWords(WORDS);
  await dictionaryService.loadAcceptedWords('palavras_aceitas.txt');

  currentGame = new TentooGame('normal', dictionaryService, WORDS, DUETO_INDEXES, QUARTETO_INDEXES);

  // Mode Dropdown Logic
  const modeToggle = document.getElementById('mode-toggle');
  const modeDropdown = document.getElementById('mode-dropdown');

  if (modeToggle) {
    modeToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      modeDropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!modeDropdown.contains(e.target)) {
        modeDropdown.classList.add('hidden');
      }
    });

    document.querySelectorAll('.mode-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        modeDropdown.classList.add('hidden');
        if (currentGame) currentGame.destroy();
        currentGame = new TentooGame(mode, dictionaryService, WORDS, DUETO_INDEXES, QUARTETO_INDEXES);
      });
    });
  }

  // Help & Debug Logic
  const helpBtn = document.getElementById('help-btn');
  let debugTimer;
  let isLongPress = false;

  const startDebug = () => {
    isLongPress = false;
    debugTimer = setTimeout(() => {
      isLongPress = true;
      if (!currentGame) return;
      let text = `[ DEBUG MODE ]\n\n🎯 TENTOO (Invertido):\n`;
      currentGame.wordsOriginal.forEach((w, i) => text += `- Tabuleiro ${i + 1}: ${w}\n`);
      text += `\n🤖 TERMOO (Original):\n`;
      currentGame.termooDebug.forEach((w, i) => text += `- Tabuleiro ${i + 1}: ${w}\n`);

      document.getElementById('debug-modal-content').textContent = text;
      document.getElementById('debug-modal-overlay').classList.remove('hidden');
    }, 7000);
  };
  const cancelDebug = () => clearTimeout(debugTimer);

  const debugOverlay = document.getElementById('debug-modal-overlay');
  document.getElementById('debug-modal-close').addEventListener('click', () => debugOverlay.classList.add('hidden'));
  debugOverlay.addEventListener('click', (e) => {
    if (e.target === debugOverlay) debugOverlay.classList.add('hidden');
  });

  if (helpBtn) {
    helpBtn.addEventListener('contextmenu', e => e.preventDefault());
    helpBtn.addEventListener('pointerdown', startDebug);
    helpBtn.addEventListener('pointerup', cancelDebug);
    helpBtn.addEventListener('pointerleave', cancelDebug);
    helpBtn.addEventListener('pointercancel', cancelDebug);

    helpBtn.addEventListener('click', (e) => {
      if (isLongPress) {
        isLongPress = false;
        e.preventDefault();
        return;
      }
      document.getElementById('help-modal-overlay').classList.remove('hidden');
    });
  }

  const helpOverlay = document.getElementById('help-modal-overlay');
  document.getElementById('help-modal-close').addEventListener('click', () => helpOverlay.classList.add('hidden'));
  helpOverlay.addEventListener('click', (e) => {
    if (e.target === helpOverlay) helpOverlay.classList.add('hidden');
  });

  document.getElementById('stats-btn').addEventListener('click', () => {
    if (currentGame) currentGame.showStats();
  });
});
