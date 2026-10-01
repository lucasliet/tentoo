import { GUESS_INSTRUCTIONS } from './solver.js';

const JEV_ENDPOINT = '/api/jev';
const JEV_TIMEOUT_MS = 30000;

export class JevError extends Error {}

/**
 * @param {string} stateText Prompt state text built by the solver
 * @param {Array<[string, string]>} options Options as [word, description] pairs
 * @returns {Promise<{ word: string, probabilities: Record<string, number>, confidence: number | null }>} Jev decision
 */
export async function decide(stateText, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JEV_TIMEOUT_MS);
  try {
    const response = await fetch(JEV_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stateText,
        options: options.map(([word, description]) => ({ word, description })),
        instructions: GUESS_INSTRUCTIONS
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const data = await response.json();
        if (data && typeof data.error === 'string') message = data.error;
      } catch {}
      throw new JevError(message);
    }
    const data = await response.json();
    if (!data || typeof data.word !== 'string' || !options.some(([word]) => word === data.word)) {
      throw new JevError('o Jev escolheu uma opção inexistente');
    }
    return { word: data.word, probabilities: data.probabilities ?? {}, confidence: data.confidence ?? null };
  } catch (error) {
    if (error instanceof JevError) throw error;
    if (controller.signal.aborted) throw new JevError('o Jev demorou demais para responder');
    if (error instanceof SyntaxError) throw new JevError('resposta inválida do Jev');
    throw new JevError('não consegui falar com o Jev');
  } finally {
    clearTimeout(timer);
  }
}
