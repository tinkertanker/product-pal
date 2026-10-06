// Validate a /api/coach request body. Pure: unknown in, typed value or error out.

import {
  COACH_STEP_IDS,
  PLATFORMS,
  STEP_IDS,
  WHY_COUNT,
  emptyCanvas,
  normaliseDone,
  normaliseJudgements,
  type Canvas,
  type ChatMessage,
  type CoachStepId,
  type Platform,
  type StepId,
} from './canvas';
import {
  CLARIFICATIONS_PER_STEP,
  COACH_MODES,
  type Clarifications,
  type CoachMode,
  type JudgeRequest,
  type SyncRequest,
} from './contracts';
import { checksFor } from './judge';

// The modes live in contracts.ts; re-exported so existing imports keep working.
export { COACH_MODES };
export type { CoachMode };

export const LIMITS = {
  field: 4000,
  message: 4000,
  messages: 40,
  /** The written brief (the PRD). */
  document: 12000,
  /** Pal's view on whether the parked idea still fits. */
  fit: 1000,
  /** Most checks a nudge can be about. */
  failed: 6,
  code: 100,
  clientId: 100,
} as const;

export type CoachRequest = {
  code: string;
  clientId: string;
  mode: CoachMode;
  /** Needed by `nudge` and `questions`. */
  step?: CoachStepId;
  canvas: Canvas;
  /** The question chat so far (`questions` mode). */
  messages: ChatMessage[];
  /** The participant's own answers in question chats, per step. Used by statement, assumptions, brief and review. */
  clarifications?: Clarifications;
  /** Ids of the checks that failed (`nudge` mode), each one of the step's own. */
  failed?: string[];
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

/** The sections whose boxes are all plain text. */
const TEXT_SECTIONS = ['who', 'success', 'bet'] as const;
/** Plain-text boxes of the brief screen (the rest are read by hand below). */
const BRIEF_TEXT_FIELDS = ['firstTwoMinutes', 'unhappyPath', 'where', 'smallestBuild', 'otherPlatform'] as const;

/**
 * Read a canvas from an untrusted body. Missing fields become empty; wrong
 * types are errors. Chats, judgements and meta are deliberately ignored here:
 * history comes in through `messages`, and only a sync carries the rest.
 */
export function readCanvas(input: unknown): Read<Canvas> {
  if (!isRecord(input)) return { ok: false, error: 'canvas must be an object.' };
  const canvas = emptyCanvas();

  for (const section of TEXT_SECTIONS) {
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
    for (const key of ['consequence', 'statement'] as const) {
      const read = readString(why[key], `canvas.why.${key}`, LIMITS.field);
      if (!read.ok) return read;
      canvas.why[key] = read.value;
    }
  }

  const brief = input.brief;
  if (brief !== undefined) {
    if (!isRecord(brief)) return { ok: false, error: 'canvas.brief must be an object.' };
    if (brief.platform !== undefined) {
      if (!PLATFORMS.includes(brief.platform as Platform)) return { ok: false, error: 'canvas.brief.platform is not recognised.' };
      canvas.brief.platform = brief.platform as Platform;
    }
    for (const key of BRIEF_TEXT_FIELDS) {
      const read = readString(brief[key], `canvas.brief.${key}`, LIMITS.field);
      if (!read.ok) return read;
      canvas.brief[key] = read.value;
    }
    const fit = readString(brief.fit, 'canvas.brief.fit', LIMITS.fit);
    if (!fit.ok) return fit;
    canvas.brief.fit = fit.value;
    const document = readString(brief.document, 'canvas.brief.document', LIMITS.document);
    if (!document.ok) return document;
    canvas.brief.document = document.value;
  }

  return { ok: true, value: canvas };
}

/** Read the per-step answers from question chats. Known step ids, lists of text, within limits. Absent means none. */
export function readClarifications(input: unknown): Read<Clarifications> {
  if (input === undefined || input === null) return { ok: true, value: {} };
  if (!isRecord(input)) return { ok: false, error: 'clarifications must be an object.' };
  const out: Clarifications = {};
  for (const [key, list] of Object.entries(input)) {
    if (!(COACH_STEP_IDS as readonly string[]).includes(key)) return { ok: false, error: `clarifications.${key} is not a known step.` };
    const read = readClarificationList(list, `clarifications.${key}`);
    if (!read.ok) return read;
    if (read.value.length > 0) out[key as CoachStepId] = read.value;
  }
  return { ok: true, value: out };
}

/** One step's grill answers. Blank entries are dropped. */
export function readClarificationList(input: unknown, path: string): Read<string[]> {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) return { ok: false, error: `${path} must be a list.` };
  if (input.length > CLARIFICATIONS_PER_STEP) return { ok: false, error: `${path} has too many answers (limit ${CLARIFICATIONS_PER_STEP}).` };
  const out: string[] = [];
  for (const [i, item] of input.entries()) {
    if (typeof item !== 'string') return { ok: false, error: `${path}[${i}] must be text.` };
    if (item.length > LIMITS.message) return { ok: false, error: `${path}[${i}] is too long (limit ${LIMITS.message} characters).` };
    if (item.trim().length > 0) out.push(item);
  }
  return { ok: true, value: out };
}

const NEEDS_STEP: readonly CoachMode[] = ['nudge', 'questions'];

export function validateCoachRequest(body: unknown): ValidationResult {
  if (!isRecord(body)) return fail('The request must be a JSON object.');

  const { code, clientId, mode, step } = body;
  if (typeof code !== 'string' || code.length === 0 || code.length > LIMITS.code) return fail('A workshop code is required.');
  if (typeof clientId !== 'string' || clientId.length === 0 || clientId.length > LIMITS.clientId) {
    return fail('A client id is required.');
  }
  if (typeof mode !== 'string' || !(COACH_MODES as readonly string[]).includes(mode)) return fail('Unknown mode.');
  const coachMode = mode as CoachMode;

  let validStep: CoachStepId | undefined;
  if (NEEDS_STEP.includes(coachMode)) {
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

  const clarifications = readClarifications(body.clarifications);
  if (!clarifications.ok) return fail(clarifications.error);

  let failed: string[] | undefined;
  if (coachMode === 'nudge' && validStep) {
    const read = readFailedChecks(body.failed, validStep);
    if (!read.ok) return fail(read.error);
    failed = read.value;
  }

  if (coachMode === 'questions' && messages.length > 0 && messages[messages.length - 1]?.role !== 'user') {
    return fail('The last message must be from the participant.');
  }
  if (coachMode === 'review' && canvas.value.brief.document.trim().length === 0) return fail('There is no brief to review.');

  return {
    ok: true,
    value: {
      code,
      clientId,
      mode: coachMode,
      step: validStep,
      canvas: canvas.value,
      messages,
      clarifications: clarifications.value,
      ...(failed ? { failed } : {}),
    },
  };
}

/** The ids of the checks a nudge is about: 1 to 6 of the step's own, each once. */
export function readFailedChecks(input: unknown, step: CoachStepId): Read<string[]> {
  if (!Array.isArray(input)) return { ok: false, error: 'failed must be a list of check ids.' };
  const known = checksFor(step).map((c) => c.id);
  const out: string[] = [];
  for (const [i, id] of input.entries()) {
    if (typeof id !== 'string' || !known.includes(id)) return { ok: false, error: `failed[${i}] is not a check on this step.` };
    if (!out.includes(id)) out.push(id);
  }
  if (out.length === 0 || out.length > LIMITS.failed) return { ok: false, error: `failed needs between 1 and ${LIMITS.failed} checks.` };
  return { ok: true, value: out };
}

// ---------------------------------------------------------------------------
// Judge and sync requests
// ---------------------------------------------------------------------------

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

function readIdentity(body: Record<string, unknown>): Checked<{ code: string; clientId: string }> {
  const { code, clientId } = body;
  if (typeof code !== 'string' || code.length === 0 || code.length > LIMITS.code) return { ok: false, error: 'A workshop code is required.' };
  if (typeof clientId !== 'string' || clientId.length === 0 || clientId.length > LIMITS.clientId) {
    return { ok: false, error: 'A client id is required.' };
  }
  return { ok: true, value: { code, clientId } };
}

export function validateJudgeRequest(body: unknown): Checked<JudgeRequest> {
  if (!isRecord(body)) return { ok: false, error: 'The request must be a JSON object.' };
  const identity = readIdentity(body);
  if (!identity.ok) return identity;
  const { step } = body;
  if (typeof step !== 'string' || !(COACH_STEP_IDS as readonly string[]).includes(step)) return { ok: false, error: 'Unknown step.' };
  const canvas = readCanvas(body.canvas);
  if (!canvas.ok) return canvas;
  const clarifications = readClarificationList(body.clarifications, 'clarifications');
  if (!clarifications.ok) return clarifications;
  return {
    ok: true,
    value: { ...identity.value, step: step as CoachStepId, canvas: canvas.value, clarifications: clarifications.value },
  };
}

/** The most check rows and characters kept from a judgement that arrives in a sync. */
const MAX_SYNC_CHECKS = 12;
const MAX_SYNC_LABEL = 200;
const MAX_SYNC_FIX = 300;

const positiveNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

/**
 * A canvas for syncing: everything readCanvas accepts, plus the chats (known
 * step ids, within the message limits), the judgements and the timestamps in `meta`.
 */
export function readSyncCanvas(input: unknown): Read<Canvas> {
  const base = readCanvas(input);
  if (!base.ok) return base;
  const raw = input as Record<string, unknown>;
  const canvas = base.value;

  if (raw.chats !== undefined) {
    if (!isRecord(raw.chats)) return { ok: false, error: 'canvas.chats must be an object.' };
    for (const [id, list] of Object.entries(raw.chats)) {
      if (!(STEP_IDS as readonly string[]).includes(id)) return { ok: false, error: `canvas.chats.${id} is not a known step.` };
      if (!Array.isArray(list)) return { ok: false, error: `canvas.chats.${id} must be a list.` };
      if (list.length > LIMITS.messages) return { ok: false, error: `canvas.chats.${id} has too many messages (limit ${LIMITS.messages}).` };
      const messages: ChatMessage[] = [];
      for (const [i, m] of list.entries()) {
        if (!isRecord(m) || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
          return { ok: false, error: `canvas.chats.${id}[${i}] must have a role and some text.` };
        }
        if (m.content.length > LIMITS.message) {
          return { ok: false, error: `canvas.chats.${id}[${i}] is too long (limit ${LIMITS.message} characters).` };
        }
        // Only the participant's own turns are ever read back, so the coach's are not stored.
        if (m.role === 'user') messages.push({ role: m.role, content: m.content });
      }
      canvas.chats[id as StepId] = messages;
    }
  }

  const judgements = normaliseJudgements(raw.judgements);
  for (const id of COACH_STEP_IDS) {
    const j = judgements[id];
    if (!j) continue;
    j.checks = j.checks
      .slice(0, MAX_SYNC_CHECKS)
      .map((c) => ({ ...c, id: c.id.slice(0, 60), label: c.label.slice(0, MAX_SYNC_LABEL), ...(c.fix === undefined ? {} : { fix: c.fix.slice(0, MAX_SYNC_FIX) }) }));
    j.fingerprint = j.fingerprint.slice(0, 32);
  }
  canvas.judgements = judgements;

  if (raw.meta !== undefined) {
    if (!isRecord(raw.meta)) return { ok: false, error: 'canvas.meta must be an object.' };
    canvas.meta = { joinedAt: positiveNumber(raw.meta.joinedAt), firstInputAt: positiveNumber(raw.meta.firstInputAt) };
  }
  return { ok: true, value: canvas };
}

export function validateSyncRequest(body: unknown): Checked<SyncRequest> {
  if (!isRecord(body)) return { ok: false, error: 'The request must be a JSON object.' };
  const identity = readIdentity(body);
  if (!identity.ok) return identity;
  const canvas = readSyncCanvas(body.canvas);
  if (!canvas.ok) return canvas;
  if (!Array.isArray(body.done)) return { ok: false, error: 'done must be a list of step ids.' };
  // A browser still running the first version sends the old step ids; normaliseDone maps them.
  for (const id of body.done) {
    if (typeof id !== 'string' || normaliseDone([id]).length === 0) return { ok: false, error: 'done has an unknown step.' };
  }
  return { ok: true, value: { ...identity.value, canvas: canvas.value, done: normaliseDone(body.done) } };
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

/** Client-side helper: what to send as `canvas` (no chats, judgements or meta; within limits). */
export function canvasForRequest(canvas: Canvas): Canvas {
  const trimmed = (text: string | undefined) => (text ?? '').slice(0, LIMITS.field);
  const c = emptyCanvas();
  for (const section of TEXT_SECTIONS) {
    const target = c[section] as Record<string, string>;
    for (const key of Object.keys(target)) target[key] = trimmed((canvas[section] as Record<string, string>)[key]);
  }
  c.why = {
    whys: c.why.whys.map((_, i) => trimmed(canvas.why.whys[i])),
    consequence: trimmed(canvas.why.consequence),
    statement: trimmed(canvas.why.statement),
  };
  const brief = { ...c.brief };
  for (const key of BRIEF_TEXT_FIELDS) brief[key] = trimmed(canvas.brief[key]);
  c.brief = {
    ...brief,
    platform: canvas.brief.platform,
    fit: canvas.brief.fit.slice(0, LIMITS.fit),
    document: canvas.brief.document.slice(0, LIMITS.document),
  };
  return c;
}
