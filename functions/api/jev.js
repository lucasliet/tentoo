const JEV_API_URL = 'https://opencode.ai/zen/v1/systemone';
const DEFAULT_MODEL = 'jev-1.13';
const MAX_STATE_LENGTH = 8192;
const MAX_OPTIONS = 8;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_INSTRUCTIONS_LENGTH = 2000;

/** @param {number} status @param {object} body @returns {Response} JSON response with no-store caching */
function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

/**
 * @param {object} body Parsed request body
 * @returns {string | null} Validation error message or null when the body is valid
 */
function validateBody(body) {
  if (!body || typeof body !== 'object') return 'Body must be a JSON object.';
  const { stateText, options, instructions } = body;
  if (typeof stateText !== 'string' || stateText.length === 0 || stateText.length > MAX_STATE_LENGTH) {
    return `stateText must be a non-empty string up to ${MAX_STATE_LENGTH} characters.`;
  }
  if (!Array.isArray(options) || options.length === 0 || options.length > MAX_OPTIONS) {
    return `options must be an array with 1 to ${MAX_OPTIONS} items.`;
  }
  for (const option of options) {
    if (!option || typeof option !== 'object') return 'Each option must be an object.';
    if (typeof option.word !== 'string' || !/^[a-z]{5}$/.test(option.word)) {
      return 'Each option.word must be a 5-letter lowercase word.';
    }
    if (typeof option.description !== 'string' || option.description.length === 0 || option.description.length > MAX_DESCRIPTION_LENGTH) {
      return `Each option.description must be a non-empty string up to ${MAX_DESCRIPTION_LENGTH} characters.`;
    }
  }
  if (instructions !== undefined && (typeof instructions !== 'string' || instructions.length > MAX_INSTRUCTIONS_LENGTH)) {
    return `instructions must be a string up to ${MAX_INSTRUCTIONS_LENGTH} characters.`;
  }
  return null;
}

/** @param {Request} request @param {{ OPENCODE_API_KEY?: string, JEV_MODEL?: string }} env Pages Function context */
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Body is not valid JSON.' });
  }

  const validationError = validateBody(body);
  if (validationError) return jsonResponse(400, { error: validationError });

  if (!env.OPENCODE_API_KEY) {
    return jsonResponse(500, { error: 'OPENCODE_API_KEY is not configured on the server.' });
  }

  const wordByOption = {};
  const criteria = {};
  body.options.forEach((option, index) => {
    const key = `option_${index}`;
    wordByOption[key] = option.word;
    criteria[key] = `${option.word}: ${option.description}`;
  });

  const payload = {
    model: env.JEV_MODEL || DEFAULT_MODEL,
    state: body.stateText,
    questions: {
      guess: {
        type: 'choice',
        instructions: typeof body.instructions === 'string' ? body.instructions : '',
        criteria
      }
    }
  };

  let upstream;
  try {
    upstream = await fetch(JEV_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENCODE_API_KEY}`
      },
      body: JSON.stringify(payload)
    });
  } catch {
    return jsonResponse(502, { error: 'Jev API is unreachable.' });
  }

  if (!upstream.ok) {
    return jsonResponse(502, { error: `Jev API returned status ${upstream.status}.` });
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return jsonResponse(502, { error: 'Jev API returned an invalid JSON response.' });
  }

  const answer = data && typeof data === 'object' ? data.answers?.guess : null;
  const choice = answer && typeof answer === 'object' ? answer.choice : null;
  if (typeof choice !== 'string' || !(choice in wordByOption)) {
    return jsonResponse(502, { error: 'Jev API did not return a valid choice.' });
  }

  const probabilities = {};
  if (answer.probabilities && typeof answer.probabilities === 'object') {
    for (const [key, value] of Object.entries(answer.probabilities)) {
      const probability = Number(value);
      if (Number.isFinite(probability)) {
        probabilities[wordByOption[key] ?? key] = probability;
      }
    }
  }
  const confidence = Number(answer.confidence);

  return jsonResponse(200, {
    word: wordByOption[choice],
    probabilities,
    confidence: Number.isFinite(confidence) ? confidence : null
  });
}
