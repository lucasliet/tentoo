import { WORDS, DUETO_INDEXES, QUARTETO_INDEXES } from '../../../../js/constants.js';
import { getTodayDateString, hashDate, normalize } from '../../../../js/helpers.js';

const invert = (termooIndex) => WORDS[WORDS.length - 1 - termooIndex];

const dateStr = getTodayDateString();
const baseDayCount = hashDate(dateStr);
const dayCount = baseDayCount - 51;

const duetoBase = (2 * dayCount) % DUETO_INDEXES.length;
const quartetoBase = (4 * dayCount) % QUARTETO_INDEXES.length;

const result = {
  date: dateStr,
  dayCount: baseDayCount,
  normal: invert(baseDayCount % WORDS.length),
  dueto: [DUETO_INDEXES[duetoBase], DUETO_INDEXES[duetoBase + 1]].map(invert),
  quarteto: [
    QUARTETO_INDEXES[quartetoBase],
    QUARTETO_INDEXES[quartetoBase + 1],
    QUARTETO_INDEXES[quartetoBase + 2],
    QUARTETO_INDEXES[quartetoBase + 3]
  ].map(invert)
};

for (const key of ['normal', 'dueto', 'quarteto']) {
  result[key === 'normal' ? 'normalNormalized' : key + 'Normalized'] =
    Array.isArray(result[key]) ? result[key].map(normalize) : normalize(result[key]);
}

console.log(JSON.stringify(result, null, 2));
