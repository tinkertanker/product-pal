// The one place that talks to TypeSafe's Jev. Plain fetch, no SDK.

import { parseJevAnswers, type JudgeRequestBody } from '../src/shared/judge';

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-latest';
export const JEV_TIMEOUT_MS = 10_000;

export class JevError extends Error {}

/** Probabilities by check id. Throws JevError on any failure (401, 422, 429, 529, timeout, odd response). */
export async function askJev(apiKey: string, body: JudgeRequestBody, timeoutMs = JEV_TIMEOUT_MS): Promise<Record<string, number>> {
  let response: Response;
  try {
    response = await fetch(JEV_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: JEV_MODEL, state: body.state, questions: body.questions }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new JevError(`Jev request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new JevError(`Jev returned ${response.status}. ${detail.slice(0, 300)}`);
  }
  const answers = parseJevAnswers(await response.json().catch(() => null));
  if (!answers) throw new JevError('Jev returned an answer we could not read.');
  return answers;
}
