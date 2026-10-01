export const GREEN = '🟩';
export const YELLOW = '🟧';
export const GRAY = '⬛';
const VOWELS = new Set('aeiou');

export const GUESS_INSTRUCTIONS =
  'Choose the next 5-letter Portuguese word guess most likely to win this ' +
  'Wordle-style game. Early guesses should maximize information using common ' +
  'Portuguese letters and vowels. When few candidates remain, prefer the most ' +
  'likely answer. When several boards are unsolved and attempts are limited, ' +
  'strongly prefer options that introduce new letters over near-duplicates of ' +
  'already guessed words, unless the option solves a board. Every option is a ' +
  'valid dictionary word consistent with all feedback received so far.';

/** @param {string} word @returns {string} Word without diacritical marks */
export function normalizeWord(word) {
  return word.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** @param {string} word @param {string} guess @param {string} feedback @returns {boolean} Whether the word is consistent with the feedback */
export function matchesFeedback(word, guess, feedback) {
  const wordLetters = [...word];
  const guessLetters = [...guess];
  const colors = [...feedback];
  const counts = new Map();
  for (const letter of wordLetters) counts.set(letter, (counts.get(letter) || 0) + 1);
  const required = new Map();
  for (let i = 0; i < guessLetters.length; i++) {
    if (colors[i] === GREEN || colors[i] === YELLOW) {
      required.set(guessLetters[i], (required.get(guessLetters[i]) || 0) + 1);
    }
  }
  for (let i = 0; i < guessLetters.length; i++) {
    if (colors[i] === GRAY && (counts.get(guessLetters[i]) || 0) > (required.get(guessLetters[i]) || 0)) return false;
  }
  for (let i = 0; i < guessLetters.length; i++) {
    if (colors[i] === GREEN && wordLetters[i] !== guessLetters[i]) return false;
    if (colors[i] === YELLOW && wordLetters[i] === guessLetters[i]) return false;
  }
  for (const [letter, minimum] of required) {
    if ((counts.get(letter) || 0) < minimum) return false;
  }
  return true;
}

/** @param {string[]} wordlist @param {{ guess: string, feedback: string }[]} rows @returns {string[]} Words matching every row */
export function filterCandidates(wordlist, rows) {
  return wordlist.filter(word => rows.every(row => matchesFeedback(word, row.guess, row.feedback)));
}

/** @param {string[]} candidates @returns {string[]} Candidates ordered by letter frequency (best first) */
export function rankCandidates(candidates) {
  const frequency = new Map();
  for (const word of candidates) {
    for (const letter of new Set(word)) {
      frequency.set(letter, (frequency.get(letter) || 0) + 1);
    }
  }
  return candidates
    .map(word => {
      let score = 0;
      for (const letter of new Set(word)) score += frequency.get(letter) || 0;
      return { word, score };
    })
    .sort((a, b) => b.score - a.score || (a.word < b.word ? -1 : 1))
    .map(entry => entry.word);
}

/** @param {string[]} candidates @param {number} limit @returns {string[]} Top ranked candidates */
export function topCandidates(candidates, limit = 8) {
  return rankCandidates(candidates).slice(0, limit);
}

/** @param {string} first @param {string} second @returns {boolean} True when the words share at least 4 distinct letters */
export function nearDuplicate(first, second) {
  const firstLetters = new Set(first);
  let shared = 0;
  for (const letter of new Set(second)) {
    if (firstLetters.has(letter)) shared++;
  }
  return shared >= 4;
}

/**
 * Builds the option list offered to Jev. While any unsolved board has more candidates
 * than remaining attempts (exploration phase), candidates that are near-duplicates of
 * already tried words are suppressed, except words that solve a board with a single
 * candidate. When every pool fits the remaining attempts (exploitation phase), the
 * plain ranked list is returned. Falls back to the ranked list when every candidate
 * ends up suppressed.
 * @param {Record<number, string[]>} pools Candidate pool per unsolved board index
 * @param {number} limit Maximum options to return
 * @param {Set<string>} triedWords Words already guessed
 * @param {number | null} attemptsLeft Attempts remaining in the game
 * @returns {string[]} Option words for the next guess
 */
export function buildOptions(pools, limit = 8, triedWords = new Set(), attemptsLeft = null) {
  const perBoard = {};
  for (const [index, pool] of Object.entries(pools)) {
    perBoard[index] = topCandidates(pool, limit);
  }
  const scores = new Map();
  for (const words of Object.values(perBoard)) {
    words.forEach((word, rank) => {
      const current = scores.get(word) || { rankSum: 0, coverage: 0 };
      scores.set(word, { rankSum: current.rankSum + rank, coverage: current.coverage + 1 });
    });
  }
  const ordered = [...scores.keys()].sort((a, b) => {
    const first = scores.get(a);
    const second = scores.get(b);
    if (first.coverage !== second.coverage) return second.coverage - first.coverage;
    if (first.rankSum !== second.rankSum) return first.rankSum - second.rankSum;
    return a < b ? -1 : 1;
  });

  const exploring = attemptsLeft !== null && Object.values(pools).some(pool => pool.length > attemptsLeft);
  if (!exploring) return ordered.slice(0, limit);

  const solvers = new Set();
  for (const pool of Object.values(pools)) {
    if (pool.length === 1) solvers.add(pool[0]);
  }
  const allowed = ordered.filter(
    word => solvers.has(word) || ![...triedWords].some(tried => nearDuplicate(word, tried))
  );
  return (allowed.length ? allowed : ordered).slice(0, limit);
}

/** @param {string} word @param {Set<string>} triedLetters @returns {string} Human-readable hint about the letters the word would reveal */
export function describeCandidate(word, triedLetters) {
  const letters = new Set(word);
  const newLetters = [...letters].filter(letter => !triedLetters.has(letter)).sort();
  const vowels = [...letters].filter(letter => VOWELS.has(letter)).sort();
  const uniqueness = letters.size === 5 ? 'all letters unique' : 'repeats a letter';
  return `new letters ${newLetters.join('') || 'none'}; vowels ${vowels.join('') || 'none'}; ${uniqueness}`;
}

/** @param {string} word @param {Record<number, string[]>} pools @param {Set<string>} triedLetters @returns {string} Description of what the word achieves per board */
export function describeOption(word, pools, triedLetters) {
  const parts = [];
  for (const index of Object.keys(pools).sort((a, b) => Number(a) - Number(b))) {
    const pool = pools[index];
    if (pool.includes(word)) {
      parts.push(pool.length === 1 ? `solves board ${Number(index) + 1}` : `board ${Number(index) + 1}: ${pool.length} candidates`);
    }
  }
  const boardInfo = parts.length ? parts.join(', ') : 'information guess for every board';
  return `${boardInfo}; ${describeCandidate(word, triedLetters)}`;
}

/** @param {object} state Serialized game state @param {Record<number, string[]>} pools @param {Array<[string, string]>} options @returns {string} Prompt state text for Jev */
export function buildStateText(state, pools, options) {
  const mode = state.mode || 'normal';
  const attemptsLeft = state.maxRows - state.currentRow;
  const lines = [
    `Portuguese Wordle (${mode} mode: ${Object.keys(pools).length} unsolved board(s)).`,
    'One 5-letter guess is applied to every board; each board has its own secret word.',
    `Attempts remaining: ${attemptsLeft}.`,
    'Feedback legend: green = correct letter and position, yellow = letter exists in another position, black = letter absent.'
  ];
  for (const index of Object.keys(pools).sort((a, b) => Number(a) - Number(b))) {
    const rows = state.boards[Number(index)].rows;
    const history = rows.map(row => `${row.guess} ${row.feedback}`).join('; ') || 'none';
    lines.push(`Board ${Number(index) + 1} (${pools[index].length} candidates): ${history}.`);
  }
  lines.push('Options for the next guess:');
  for (const [word, description] of options) lines.push(`- ${word}: ${description}`);
  return lines.join('\n');
}
