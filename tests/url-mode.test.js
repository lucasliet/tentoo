import { test } from 'node:test';
import assert from 'node:assert/strict';

import { modeFromHash } from '../js/constants.js';

test('shouldResolveModeFromUrlHash', () => {
  // Given
  const cases = [
    ['#dueto', 'dueto'],
    ['#quarteto', 'quarteto'],
    ['#normal', 'normal'],
    ['#DUETO', 'dueto'],
    ['', 'normal'],
    ['#', 'normal'],
    ['#modo-invalido', 'normal']
  ];

  for (const [hash, expected] of cases) {
    // When
    const mode = modeFromHash(hash);

    // Then
    assert.equal(mode, expected, `hash "${hash}" should resolve to "${expected}"`);
  }
});
