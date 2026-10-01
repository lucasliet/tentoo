import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GRAY,
  GREEN,
  YELLOW,
  buildOptions,
  buildStateText,
  describeOption,
  filterCandidates,
  matchesFeedback,
  nearDuplicate,
  normalizeWord,
  topCandidates
} from '../js/jev/solver.js';

test('shouldNormalizeWordsWithoutDiacritics', () => {
  assert.equal(normalizeWord('Ações'), 'acoes');
  assert.equal(normalizeWord('ÍAMOS'), 'iamos');
});

test('shouldMatchFeedbackForExactWord', () => {
  const feedback = GREEN + GREEN + GREEN + GREEN + GREEN;
  assert.equal(matchesFeedback('cerca', 'cerca', feedback), true);
  assert.equal(matchesFeedback('cerca', 'carne', feedback), false);
});

test('shouldRejectLetterMarkedYellowInSamePosition', () => {
  assert.equal(matchesFeedback('sorte', 'festa', GRAY + YELLOW + YELLOW + GRAY + GREEN), false);
  assert.equal(matchesFeedback('festa', 'festa', GRAY + YELLOW + YELLOW + GRAY + GREEN), false);
  assert.equal(matchesFeedback('rente', 'festa', GRAY + YELLOW + YELLOW + GRAY + GREEN), false);
});

test('shouldHandleDuplicateLettersInFeedback', () => {
  const feedback = YELLOW + GRAY + GRAY + GREEN + YELLOW;
  assert.equal(matchesFeedback('osso', 'sacos', feedback), true);
  assert.equal(matchesFeedback('salsa', 'sacos', feedback), false);
});

test('shouldFilterCandidatesByAllRows', () => {
  // Given
  const wordlist = ['veria', 'cerca', 'casas'];
  const rows = [
    { guess: 'sorte', feedback: GRAY + GRAY + GREEN + GRAY + YELLOW },
    { guess: 'cerca', feedback: GREEN + GREEN + GREEN + GREEN + GREEN }
  ];

  // When
  const candidates = filterCandidates(wordlist, rows);

  // Then
  assert.deepEqual(candidates, ['cerca']);
});

test('shouldRankCandidatesByCommonLetters', () => {
  assert.deepEqual(topCandidates(['arara', 'sorte'], 1), ['sorte']);
});

test('shouldPreferOptionsCoveringMoreBoards', () => {
  // Given
  const pools = { 0: ['sorte', 'carne'], 1: ['sorte', 'perua'] };

  // When
  const options = buildOptions(pools, 3);

  // Then
  assert.equal(options[0], 'sorte');
});

test('shouldEnsureEveryBoardHasACandidate', () => {
  const pools = { 0: ['sorte'], 1: ['carne', 'perua'] };
  const options = buildOptions(pools, 2);
  assert.ok(['sorte', 'carne'].every(word => options.includes(word)));
});

test('shouldSuppressNearDuplicatesOfTriedWordsWhileExploring', () => {
  // Given
  const pools = { 0: ['abril', 'abris', 'abrir', 'corta', 'hidro'] };

  // When
  const options = buildOptions(pools, 5, new Set(['abriu']), 2);

  // Then
  assert.deepEqual([...options].sort(), ['corta', 'hidro']);
});

test('shouldKeepWordThatSolvesABoardWhileExploring', () => {
  // Given
  const pools = { 0: ['abril', 'abris', 'abrir', 'corta'], 1: ['abrir'] };

  // When
  const options = buildOptions(pools, 4, new Set(['abriu']), 2);

  // Then
  assert.ok(options.includes('abrir'));
  assert.ok(!options.includes('abril'));
  assert.ok(!options.includes('abris'));
});

test('shouldOfferFamilyWordsWhenPoolsFitRemainingAttempts', () => {
  // Given
  const pools = { 0: ['abril', 'abris', 'abrir'] };

  // When
  const options = buildOptions(pools, 3, new Set(['abriu']), 3);

  // Then
  assert.deepEqual([...options].sort(), ['abril', 'abrir', 'abris']);
});

test('shouldFallBackToRankedOptionsWhenEveryCandidateIsSuppressed', () => {
  // Given
  const pools = { 0: ['abril', 'abris', 'abrir'] };

  // When
  const options = buildOptions(pools, 3, new Set(['abriu']), 2);

  // Then
  assert.deepEqual([...options].sort(), ['abril', 'abrir', 'abris']);
});

test('shouldDetectNearDuplicatesBySharedLetters', () => {
  assert.equal(nearDuplicate('abriu', 'abril'), true);
  assert.equal(nearDuplicate('areio', 'abriu'), false);
});

test('shouldDescribeOptionWithBoardInfoAndLetters', () => {
  // Given
  const pools = { 0: ['abrir'] };
  const triedLetters = new Set('abriu'.split(''));

  // When
  const description = describeOption('abrir', pools, triedLetters);

  // Then
  assert.ok(description.includes('solves board 1'));
  assert.ok(description.includes('new letters none'));
});

test('shouldBuildStateTextWithHistoryAndOptions', () => {
  // Given
  const state = {
    mode: 'quarteto',
    currentRow: 1,
    maxRows: 9,
    boards: [{ rows: [{ guess: 'areio', feedback: GREEN + GRAY + GRAY + GRAY + GRAY }] }]
  };
  const pools = { 0: ['abril', 'abrir'] };

  // When
  const text = buildStateText(state, pools, [['abrir', 'solves board 1; new letters none']]);

  // Then
  assert.ok(text.includes('quarteto mode'));
  assert.ok(text.includes('areio ' + GREEN + GRAY + GRAY + GRAY + GRAY));
  assert.ok(text.includes('Options for the next guess:'));
  assert.ok(text.includes('- abrir:'));
});
