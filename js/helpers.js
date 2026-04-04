/** @param {string} word @returns {string} Word without diacritical marks */
export function normalize(word) {
  return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** @returns {string} Date string in format DD/MM/YYYY for Brasilia timezone */
export function getTodayDateString() {
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/**
 * @param {string} dateStr
 * @returns {number} Hash value from date string
 */
export function hashDate(dateStr) {
  const [day, month, year] = dateStr.split('/');
  const targetDate = new Date(year, month - 1, day);
  const baseDate = new Date(2022, 0, 2, 0, 0, 0, 0);
  const adjustedBaseDate = new Date(2022, 0, 2, 0, 0, -baseDate.getTimezoneOffset(), 0);
  return Math.floor((targetDate - adjustedBaseDate) / 864e5);
}

/**
 * @param {string} mode
 * @param {string[]} WORDS
 * @param {number[]} DUETO_INDEXES
 * @param {number[]} QUARTETO_INDEXES
 * @returns {{ original: string[], normalized: string[], termooDebug: string[] }}
 */
export function getWordsForMode(mode, WORDS, DUETO_INDEXES, QUARTETO_INDEXES) {
  const dateStr = getTodayDateString();
  const baseDayCount = hashDate(dateStr);

  let termooIndexes = [];

  if (mode === "normal") {
    termooIndexes = [baseDayCount % WORDS.length];
  } else {
    const dayCount = baseDayCount - 51;
    if (mode === "dueto") {
      const base = (2 * dayCount) % DUETO_INDEXES.length;
      termooIndexes = [DUETO_INDEXES[base], DUETO_INDEXES[base + 1]];
    } else if (mode === "quarteto") {
      const base = (4 * dayCount) % QUARTETO_INDEXES.length;
      termooIndexes = [
        QUARTETO_INDEXES[base],
        QUARTETO_INDEXES[base + 1],
        QUARTETO_INDEXES[base + 2],
        QUARTETO_INDEXES[base + 3]
      ];
    }
  }

  const tentooIndexes = termooIndexes.map(t => WORDS.length - 1 - t);

  return {
    original: tentooIndexes.map(i => WORDS[i]),
    normalized: tentooIndexes.map(i => normalize(WORDS[i])),
    termooDebug: termooIndexes.map(i => WORDS[i])
  };
}

/**
 * @param {string[]} WORDS
 * @returns {Set<string>}
 */
export function createNormalizedSet(WORDS) {
  return new Set(WORDS.map(w => normalize(w)));
}
