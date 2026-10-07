// Talking to our own server. Nothing here knows about prompts.

import { readCoachStream } from './shared/coachStream';
import { parseRetryAfter } from './shared/syncPolicy';
import type { Artifact } from './shared/session';
import { normaliseCanvas, normaliseDone, type Canvas, type ChatMessage, type CoachStepId } from './shared/canvas';
import type {
  Clarifications,
  CoachMode,
  JudgeRequest,
  Judgement,
  ParticipantDetail,
  ParticipantSummary,
  PublicSettings,
  Settings,
} from './shared/contracts';

export class UnauthorisedError extends Error {}

export type CoachBody = {
  code: string;
  clientId: string;
  mode: CoachMode;
  step?: CoachStepId;
  canvas: Canvas;
  /** The question chat so far (`questions` mode). */
  messages?: ChatMessage[];
  /** Ids of the checks that were missed (`nudge` mode, 1 to 6). */
  failed?: string[];
  /** The participant's own answers in the question chats (`statement`, `assumptions`, `brief` and `review`). */
  clarifications?: Clarifications;
  artifacts?: Artifact[];
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

/** How long to wait for the first bytes (the model thinks before it answers), then between chunks. */
export const COACH_FIRST_BYTE_MS = 100_000;
export const COACH_IDLE_MS = 60_000;

export type CoachResult = {
  text: string;
  /** The reply hit the length limit, so its end is missing. */
  truncated: boolean;
};

/**
 * Stream a coach reply. `onText` receives the whole reply so far each time
 * more arrives. Resolves with the final text, or throws if the reply failed,
 * including partway through or if nothing arrives for a minute. Error text is
 * never part of the reply.
 */
export async function streamCoach(body: CoachBody, onText: (textSoFar: string) => void, signal: AbortSignal): Promise<CoachResult> {
  const inner = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const relay = () => {
    inner.abort();
    reader?.cancel().catch(() => undefined);
  };
  if (signal.aborted) inner.abort();
  else signal.addEventListener('abort', relay, { once: true });
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      inner.abort();
      reader?.cancel().catch(() => undefined);
    }, ms);
  };
  const stopped = () => new Error(COACH_STOPPED);

  try {
    arm(COACH_FIRST_BYTE_MS);
    let response: Response;
    try {
      response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: inner.signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      if (timedOut) throw stopped();
      throw new Error("We can't reach the server just now. Please check your connection and try again.");
    }
    if (signal.aborted) {
      void response.body?.cancel().catch(() => undefined);
      throw new DOMException('Aborted', 'AbortError');
    }
    if (response.status === 401) throw new UnauthorisedError();
    if (!response.ok || !response.body) throw new Error(await errorFrom(response, "Your coach couldn't answer just now. Please try again in a moment."));

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let raw = '';
    let text = '';
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (signal.aborted) throw error;
        throw stopped();
      }
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      if (timedOut) throw stopped();
      if (chunk.done) break;
      arm(COACH_IDLE_MS);
      raw += decoder.decode(chunk.value, { stream: true });
      const next = readCoachStream(raw).text;
      if (next !== text) {
        text = next;
        onText(text);
      }
    }
    raw += decoder.decode();
    const { text: final, end } = readCoachStream(raw);
    if (end !== 'ok' && end !== 'truncated') throw stopped();
    if (final !== text) onText(final);
    return { text: final, truncated: end === 'truncated' };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', relay);
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Read a PublicSettings from untrusted JSON (the network or localStorage). Null if it is not one. */
export function parsePublicSettings(input: unknown): PublicSettings | null {
  if (typeof input !== 'object' || input === null) return null;
  const r = input as Record<string, unknown>;
  if (typeof r.showTimings !== 'boolean' || typeof r.aiJudge !== 'boolean' || typeof r.judgeAvailable !== 'boolean') return null;
  return { showTimings: r.showTimings, aiJudge: r.aiJudge, judgeAvailable: r.judgeAvailable };
}

/** Null when the server can't be reached or answers oddly; the caller keeps what it had. */
export async function fetchPublicSettings(): Promise<PublicSettings | null> {
  try {
    const response = await fetch('/api/settings', { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    return parsePublicSettings(await response.json());
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The step checker
// ---------------------------------------------------------------------------

const JUDGE_FALLBACK = "The step checker couldn't answer just now. Please try again in a moment.";

function isJudgement(value: unknown): value is Judgement {
  if (typeof value !== 'object' || value === null) return false;
  const j = value as Record<string, unknown>;
  return typeof j.pass === 'boolean' && typeof j.fingerprint === 'string' && Array.isArray(j.checks);
}

/** Ask the step checker about one step. Throws UnauthorisedError if the code no longer works. */
export async function requestJudgement(body: JudgeRequest): Promise<Judgement> {
  let response: Response;
  try {
    response = await fetch('/api/judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error("We can't reach the server just now. Please check your connection and try again.");
  }
  if (response.status === 401) throw new UnauthorisedError();
  if (response.status === 429) throw new Error(await errorFrom(response, 'That was a few checks in a row. Please wait a moment and try again.'));
  if (!response.ok) throw new Error(await errorFrom(response, JUDGE_FALLBACK));
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error(JUDGE_FALLBACK);
  }
  if (!isJudgement(json)) throw new Error(JUDGE_FALLBACK);
  return json;
}

// ---------------------------------------------------------------------------
// Progress sync (quiet: failures are logged and forgotten)
// ---------------------------------------------------------------------------

/** What became of a sync: saved, worth another try later, or refused for good. */
export type SyncOutcome = 'saved' | 'retry' | 'refused';

/** A sync that failed for a passing reason (the network, the server, a rate limit) is worth retrying. */
export function syncOutcome(status: number): SyncOutcome {
  if (status >= 200 && status < 300) return 'saved';
  return status === 429 || status >= 500 ? 'retry' : 'refused';
}

export type SyncResult = { outcome: SyncOutcome; /** From a Retry-After header on a 429 or 503. */ retryAfterSeconds?: number };

/** A sync that has not answered by now is treated as a failure worth retrying. */
const SYNC_TIMEOUT_MS = 8000;

export async function postSync(json: string): Promise<SyncResult> {
  try {
    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: json.length < 60_000,
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
    });
    const outcome = syncOutcome(response.status);
    if (outcome !== 'saved') console.warn(`Progress sync was refused (${response.status}).`);
    const retryAfterSeconds = response.status === 429 || response.status === 503 ? parseRetryAfter(response.headers.get('Retry-After')) : undefined;
    return { outcome, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) };
  } catch (error) {
    console.warn('Progress sync failed.', error);
    return { outcome: 'retry' };
  }
}

/** For when the tab is being hidden: hand the body to the browser to send after we are gone. */
export function beaconSync(json: string): void {
  try {
    const sent = typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/sync', new Blob([json], { type: 'application/json' }));
    if (!sent) void postSync(json);
  } catch (error) {
    console.warn('Progress sync failed.', error);
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export class AdminError extends Error {}

async function adminCall<T>(password: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${password}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new AdminError("Can't reach the server just now.");
  }
  if (response.status === 401) throw new UnauthorisedError();
  if (response.status === 503) throw new AdminError('The admin page is not set up on this server yet. It needs an ADMIN_PASSWORD secret.');
  if (!response.ok) throw new AdminError(await errorFrom(response, 'Something went wrong on our side. Please try again.'));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const adminParticipants = (password: string) =>
  adminCall<{ participants: ParticipantSummary[] }>(password, '/api/admin/participants').then((r) => r.participants.map((p) => ({ ...p, done: normaliseDone(p.done) })));
export const adminParticipant = (password: string, clientId: string) =>
  adminCall<ParticipantDetail>(password, `/api/admin/participants/${encodeURIComponent(clientId)}`).then((d) => ({ participant: { ...d.participant, done: normaliseDone(d.participant.done) }, canvas: normaliseCanvas(d.canvas) }));
export const adminSettings = (password: string) => adminCall<Settings>(password, '/api/admin/settings');
export const adminSaveSettings = (password: string, patch: Partial<Settings>) =>
  adminCall<Settings>(password, '/api/admin/settings', { method: 'PUT', body: patch });
export const adminClearParticipants = (password: string) => adminCall<unknown>(password, '/api/admin/participants', { method: 'DELETE' });
