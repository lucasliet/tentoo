import { test } from 'node:test';
import assert from 'node:assert/strict';

import { JevError, decide } from '../js/jev/jevClient.js';

const OPTIONS = [
  ['sorte', 'board 1: 2 candidates'],
  ['carne', 'board 1: 2 candidates']
];

function withFetch(stub, run) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  return Promise.resolve()
    .then(run)
    .finally(() => {
      globalThis.fetch = original;
    });
}

test('shouldReturnDecisionWhenJevResponds', () => {
  return withFetch(async () => new Response(JSON.stringify({ word: 'carne', probabilities: { carne: 0.6 }, confidence: 0.4 }), { status: 200 }), async () => {
    const decision = await decide('state text', OPTIONS);
    assert.deepEqual(decision, { word: 'carne', probabilities: { carne: 0.6 }, confidence: 0.4 });
  });
});

test('shouldRejectWordOutsideTheOfferedOptions', () => {
  return withFetch(async () => new Response(JSON.stringify({ word: 'perua' }), { status: 200 }), async () => {
    await assert.rejects(decide('state text', OPTIONS), error => {
      assert.ok(error instanceof JevError);
      assert.ok(error.message.includes('opção inexistente'));
      return true;
    });
  });
});

test('shouldSurfaceApiErrorMessage', () => {
  return withFetch(async () => new Response(JSON.stringify({ error: 'OPENCODE_API_KEY is not configured' }), { status: 500 }), async () => {
    await assert.rejects(decide('state text', OPTIONS), error => {
      assert.ok(error instanceof JevError);
      assert.ok(error.message.includes('OPENCODE_API_KEY'));
      return true;
    });
  });
});

test('shouldReportNetworkFailuresAsJevErrors', () => {
  return withFetch(async () => {
    throw new TypeError('fetch failed');
  }, async () => {
    await assert.rejects(decide('state text', OPTIONS), error => {
      assert.ok(error instanceof JevError);
      assert.ok(error.message.includes('não consegui falar'));
      return true;
    });
  });
});

test('shouldReportInvalidJsonAsJevErrors', () => {
  return withFetch(async () => new Response('<html>', { status: 200 }), async () => {
    await assert.rejects(decide('state text', OPTIONS), error => {
      assert.ok(error instanceof JevError);
      assert.ok(error.message.includes('resposta inválida'));
      return true;
    });
  });
});
