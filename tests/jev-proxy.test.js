import { test } from 'node:test';
import assert from 'node:assert/strict';

import { onRequestPost, validateBody } from '../functions/api/jev.js';

const VALID_BODY = {
  stateText: 'Portuguese Wordle (normal mode: 1 unsolved board(s)).',
  options: [
    { word: 'sorte', description: 'board 1: 2 candidates; new letters sort' },
    { word: 'carne', description: 'board 1: 2 candidates; new letters carn' }
  ],
  instructions: 'Choose the next guess.'
};

test('shouldAcceptValidBody', () => {
  assert.equal(validateBody(VALID_BODY), null);
});

test('shouldRejectBodiesWithInvalidFields', () => {
  const cases = [
    [null, 'object'],
    ['text', 'object'],
    [{ ...VALID_BODY, stateText: 123 }, 'stateText'],
    [{ ...VALID_BODY, stateText: '' }, 'stateText'],
    [{ ...VALID_BODY, options: [] }, 'options'],
    [{ ...VALID_BODY, options: Array.from({ length: 9 }, () => VALID_BODY.options[0]) }, 'options'],
    [{ ...VALID_BODY, options: [{ word: 'abc', description: 'x' }] }, 'word'],
    [{ ...VALID_BODY, options: [{ word: 'sorte', description: '' }] }, 'description'],
    [{ ...VALID_BODY, instructions: 'x'.repeat(2001) }, 'instructions']
  ];
  for (const [body, expectedFragment] of cases) {
    const error = validateBody(body);
    assert.equal(typeof error, 'string', JSON.stringify(body));
    assert.ok(error.includes(expectedFragment), `${error} should mention ${expectedFragment}`);
  }
});

test('shouldReturn400WhenBodyIsNotJson', async () => {
  const request = new Request('https://tentoo.pages.dev/api/jev', {
    method: 'POST',
    body: 'not json',
    headers: { 'Content-Type': 'application/json' }
  });
  const response = await onRequestPost({ request, env: { OPENCODE_API_KEY: 'k' } });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Body is not valid JSON.' });
});

test('shouldReturn500WhenApiKeyIsMissing', async () => {
  const request = new Request('https://tentoo.pages.dev/api/jev', {
    method: 'POST',
    body: JSON.stringify(VALID_BODY)
  });
  const response = await onRequestPost({ request, env: {} });
  assert.equal(response.status, 500);
  const data = await response.json();
  assert.ok(data.error.includes('OPENCODE_API_KEY'));
});

test('shouldForwardToJevAndMapChoiceToWord', async () => {
  // Given
  let captured = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    captured = { url, payload: JSON.parse(init.body), headers: init.headers };
    return new Response(JSON.stringify({
      answers: {
        guess: {
          choice: 'option_1',
          probabilities: { option_1: 0.6, option_0: 0.4 },
          confidence: 0.5
        }
      }
    }), { status: 200 });
  };

  try {
    // When
    const request = new Request('https://tentoo.pages.dev/api/jev', {
      method: 'POST',
      body: JSON.stringify(VALID_BODY)
    });
    const response = await onRequestPost({ request, env: { OPENCODE_API_KEY: 'secret', JEV_MODEL: 'jev-1.13' } });
    const data = await response.json();

    // Then
    assert.equal(response.status, 200);
    assert.equal(captured.url, 'https://opencode.ai/zen/v1/systemone');
    assert.equal(captured.payload.model, 'jev-1.13');
    assert.equal(captured.payload.questions.guess.criteria.option_1, 'carne: board 1: 2 candidates; new letters carn');
    assert.ok(captured.headers.Authorization.startsWith('Bearer '));
    assert.deepEqual(data, {
      word: 'carne',
      probabilities: { carne: 0.6, sorte: 0.4 },
      confidence: 0.5
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('shouldReturn502WhenJevReturnsInvalidChoice', async () => {
  // Given
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ answers: { guess: { choice: 'option_9' } } }), { status: 200 });

  try {
    // When
    const request = new Request('https://tentoo.pages.dev/api/jev', {
      method: 'POST',
      body: JSON.stringify(VALID_BODY)
    });
    const response = await onRequestPost({ request, env: { OPENCODE_API_KEY: 'secret' } });

    // Then
    assert.equal(response.status, 502);
    const data = await response.json();
    assert.ok(data.error.includes('valid choice'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
