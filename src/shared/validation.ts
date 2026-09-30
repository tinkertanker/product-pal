// Validate a /api/coach request body. Pure: unknown in, typed value or error out.

import {
  COACH_STEP_IDS,
  PLATFORMS,
  WHY_COUNT,
  emptyCanvas,
  type Canvas,
  type ChatMessage,
  type CoachStepId,
  type Platform,
} from './canvas';

export const COACH_MODES = ['challenge', 'grill', 'build', 'tune'] as const;
export type CoachMode = (typeof COACH_MODES)[number];

export const LIMITS = {
  field: 4000,
  message: 4000,
  messages: 40,
  buildPrompt: 12000,
  code: 100,
  clientId: 100,
} as const;

export type CoachRequest = {
  code: string;
  clientId: string;
  mode: CoachMode;
  step?: CoachStepId;
  canvas: Canvas;
  messages: ChatMessage[];
};

export type ValidationResult = { ok: true; value: CoachRequest } | { ok: false; error: string };

const fail = (error: string): ValidationResult => ({ ok: false, error });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type Read<T> = { ok: true; value: T } | { ok: false; error: string };

function readString(value: unknown, path: string, max: number): Read<string> {
  if (value === undefined || value === null) return { ok: true, value: '' };
  if (typeof value !== 'string') return { ok: false, error: `${path} must be text.` };
  if (value.length > max) return { ok: false, error: `${path} is too long (limit ${max} characters).` };
  return { ok: true, value };
}

/** Read a canvas from an untrusted body. Missing fields become empty; wrong types are errors. */
export function readCanvas(input: unknown): Read<Canvas> {
  if (!isRecord(input)) return { ok: false, error: 'canvas must be an object.' };
  const canvas = emptyCanvas();

  const sections = ['idea', 'problem', 'metric', 'assumption', 'experience'] as const;
  for (const section of sections) {
    const raw = input[section];
    if (raw === undefined) continue;
    if (!isRecord(raw)) return { ok: false, error: `canvas.${section} must be an object.` };
    const target = canvas[section] as Record<string, string>;
    for (const key of Object.keys(target)) {
      const read = readString(raw[key], `canvas.${section}.${key}`, LIMITS.field);
      if (!read.ok) return read;
      target[key] = read.value;
    }
  }

  const why = input.why;
  if (why !== undefined) {
    if (!isRecord(why)) return { ok: false, error: 'canvas.why must be an object.' };
    if (why.whys !== undefined) {
      if (!Array.isArray(why.whys) || why.whys.length > WHY_COUNT) {
        return { ok: false, error: `canvas.why.whys must be a list of up to ${WHY_COUNT}.` };
      }
      for (let i = 0; i < why.whys.length; i++) {
        const read = readString(why.whys[i], `canvas.why.whys[${i}]`, LIMITS.field);
        if (!read.ok) return read;
        canvas.why.whys[i] = read.value;
      }
    }
    const statement = readString(why.statement, 'canvas.why.statement', LIMITS.field);
    if (!statement.ok) return statement;
    canvas.why.statement = statement.value;
  }

  const build = input.build;
  if (build !== undefined) {
    if (!isRecord(build)) return { ok: false, error: 'canvas.build must be an object.' };
    if (build.platform !== undefined) {
      if (!PLATFORMS.includes(build.platform as Platform)) return { ok: false, error: 'canvas.build.platform is not recognised.' };
      canvas.build.platform = build.platform as Platform;
    }
    const other = readString(build.otherPlatform, 'canvas.build.otherPlatform', LIMITS.field);
    if (!other.ok) return other;
    canvas.build.otherPlatform = other.value;
    if (build.includeGrill !== undefined) {
      if (typeof build.includeGrill !== 'boolean') return { ok: false, error: 'canvas.build.includeGrill must be true or false.' };
      canvas.build.includeGrill = build.includeGrill;
    }
    const prompt = readString(build.prompt, 'canvas.build.prompt', LIMITS.buildPrompt);
    if (!prompt.ok) return prompt;
    canvas.build.prompt = prompt.value;
  }

  // canvas.chats is deliberately ignored: history comes in through `messages`.
  return { ok: true, value: canvas };
}

export function validateCoachRequest(body: unknown): ValidationResult {
  if (!isRecord(body)) return fail('The request must be a JSON object.');

  const { code, clientId, mode, step } = body;
  if (typeof code !== 'string' || code.length === 0 || code.length > LIMITS.code) return fail('A workshop code is required.');
  if (typeof clientId !== 'string' || clientId.length === 0 || clientId.length > LIMITS.clientId) {
    return fail('A client id is required.');
  }
  if (typeof mode !== 'string' || !(COACH_MODES as readonly string[]).includes(mode)) return fail('Unknown mode.');

  let validStep: CoachStepId | undefined;
  if (mode === 'challenge' || mode === 'grill') {
    if (typeof step !== 'string' || !(COACH_STEP_IDS as readonly string[]).includes(step)) return fail('Unknown step.');
    validStep = step as CoachStepId;
  }

  const canvas = readCanvas(body.canvas);
  if (!canvas.ok) return fail(canvas.error);

  const messages: ChatMessage[] = [];
  if (body.messages !== undefined) {
    if (!Array.isArray(body.messages)) return fail('messages must be a list.');
    if (body.messages.length > LIMITS.messages) return fail(`Too many messages (limit ${LIMITS.messages}).`);
    for (const [i, m] of body.messages.entries()) {
      if (!isRecord(m) || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
        return fail(`messages[${i}] must have a role and some text.`);
      }
      if (m.content.length > LIMITS.message) return fail(`messages[${i}] is too long (limit ${LIMITS.message} characters).`);
      messages.push({ role: m.role, content: m.content });
    }
  }

  if (mode === 'grill' && messages.length > 0 && messages[messages.length - 1]?.role !== 'user') {
    return fail('The last message must be from the participant.');
  }
  if (mode === 'tune' && canvas.value.build.prompt.trim().length === 0) return fail('There is no build prompt to tune.');

  return {
    ok: true,
    value: { code, clientId, mode: mode as CoachMode, step: validStep, canvas: canvas.value, messages },
  };
}

/**
 * Client-side helper: keep a chat inside the server's limits. Drops the oldest
 * messages first and makes sure the list starts with a participant turn.
 */
export function clampMessages(messages: readonly ChatMessage[]): ChatMessage[] {
  let out = messages.slice(-LIMITS.messages).map((m) => ({ role: m.role, content: m.content.slice(0, LIMITS.message) }));
  while (out.length > 0 && out[0]?.role !== 'user') out = out.slice(1);
  return out;
}

/** Client-side helper: what to send as `canvas` (no chat history, within limits). */
export function canvasForRequest(canvas: Canvas): Canvas {
  const trimmed = (s: string) => s.slice(0, LIMITS.field);
  const c = emptyCanvas();
  for (const section of ['idea', 'problem', 'metric', 'assumption', 'experience'] as const) {
    const target = c[section] as Record<string, string>;
    for (const key of Object.keys(target)) target[key] = trimmed((canvas[section] as Record<string, string>)[key] ?? '');
  }
  c.why.whys = canvas.why.whys.map(trimmed);
  c.why.statement = trimmed(canvas.why.statement);
  c.build = {
    platform: canvas.build.platform,
    otherPlatform: trimmed(canvas.build.otherPlatform),
    includeGrill: canvas.build.includeGrill,
    prompt: canvas.build.prompt.slice(0, LIMITS.buildPrompt),
  };
  return c;
}
