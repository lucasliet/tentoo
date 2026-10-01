import { GUESS_INSTRUCTIONS } from './solver.js';

const JEV_ENDPOINT = '/api/jev';

export class JevError extends Error {}

/**
 * @param {string} stateText Prompt state text built by the solver
 * @param {Array<[string, string]>} options Options as [word, description] pairs
 * @returns {Promise<{ word: string, probabilities: Record<string, number>, confidence: number | null }>} Jev decision
 */
export async function decide(stateText, options) {
  let response;
  try {
    response = await fetch(JEV_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stateText,
        options: options.map(([word, description]) => ({ word, description })),
        instructions: GUESS_INSTRUCTIONS
      })
    });
  } catch {
    throw new JevError('não consegui falar com o Jev');
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (data && typeof data.error === 'string') message = data.error;
    } catch {}
    throw new JevError(message);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new JevError('resposta inválida do Jev');
  }
  if (!data || typeof data.word !== 'string' || !options.some(([word]) => word === data.word)) {
    throw new JevError('o Jev escolheu uma opção inexistente');
  }
  return { word: data.word, probabilities: data.probabilities ?? {}, confidence: data.confidence ?? null };
}
