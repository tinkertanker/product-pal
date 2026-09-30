// Talking to our own server. Nothing here knows about prompts.

import { readCoachStream } from './shared/coachStream';
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
    return { ok: false, error: await errorFrom(response, 'Something went wrong on our side. Please try again in a moment.') };
  } catch {
    return { ok: false, error: "We can't reach the server just now. Please check your connection and try again." };
  }
}

const COACH_STOPPED = 'Your coach stopped partway through. Please try again in a moment.';

export type CoachResult = {
  text: string;
  /** The reply hit the length limit, so its end is missing. */
  truncated: boolean;
};

/**
 * Stream a coach reply. `onText` receives the whole reply so far each time
 * more arrives. Resolves with the final text, or throws if the reply failed,
 * including partway through. Error text is never part of the reply.
 */
export async function streamCoach(body: CoachBody, onText: (textSoFar: string) => void, signal: AbortSignal): Promise<CoachResult> {
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
    throw new Error("We can't reach the server just now. Please check your connection and try again.");
  }
  if (response.status === 401) throw new UnauthorisedError();
  if (!response.ok || !response.body) throw new Error(await errorFrom(response, "Your coach couldn't answer just now. Please try again in a moment."));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  let text = '';
  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error(COACH_STOPPED);
    }
    if (chunk.done) break;
    raw += decoder.decode(chunk.value, { stream: true });
    const next = readCoachStream(raw).text;
    if (next !== text) {
      text = next;
      onText(text);
    }
  }
  raw += decoder.decode();
  const { text: final, end } = readCoachStream(raw);
  if (end !== 'ok' && end !== 'truncated') throw new Error(COACH_STOPPED);
  if (final !== text) onText(final);
  return { text: final, truncated: end === 'truncated' };
}
