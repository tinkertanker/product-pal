// Talking to our own server. Nothing here knows about prompts.

import type { CoachMode } from './shared/validation';
import type { Canvas, ChatMessage, CoachStepId } from './shared/canvas';

export class UnauthorisedError extends Error {}

export type CoachBody = {
  code: string;
  clientId: string;
  mode: CoachMode;
  step?: CoachStepId;
  canvas: Canvas;
  messages?: ChatMessage[];
};

async function errorFrom(response: Response, fallback: string): Promise<string> {
  try {
    const json = (await response.json()) as { error?: string };
    if (json.error) return json.error;
  } catch {
    /* not JSON */
  }
  return fallback;
}

export async function joinWorkshop(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (response.ok) return { ok: true };
    return { ok: false, error: await errorFrom(response, 'Something went wrong. Try again.') };
  } catch {
    return { ok: false, error: "Can't reach the server. Check your connection and try again." };
  }
}

/**
 * Stream a coach reply. `onText` receives the whole reply so far each time
 * more arrives. Resolves with the final text.
 */
export async function streamCoach(body: CoachBody, onText: (textSoFar: string) => void, signal: AbortSignal): Promise<string> {
  let response: Response;
  try {
    response = await fetch('/api/coach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error("Can't reach the server. Check your connection and try again.");
  }
  if (response.status === 401) throw new UnauthorisedError();
  if (!response.ok || !response.body) throw new Error(await errorFrom(response, 'The coach could not answer. Try again.'));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    onText(text);
  }
  text += decoder.decode();
  onText(text);
  return text;
}
