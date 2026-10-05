// Shapes that cross the wire between the browser and the Worker. Pure types
// and tiny helpers only; both sides import from here so they cannot drift.

import type { Canvas, ChatMessage, CoachStepId, StepId } from './canvas';

// ---------------------------------------------------------------------------
// Settings (set by a facilitator on /admin, read by every participant)
// ---------------------------------------------------------------------------

export type Settings = {
  /** Show the suggested minutes on each step. Off by default. */
  showTimings: boolean;
  /** Use the AI judge (Jev) to decide when a step is done. Needs TYPESAFE_API_KEY. */
  aiJudge: boolean;
};

export const DEFAULT_SETTINGS: Settings = { showTimings: false, aiJudge: true };

/** GET /api/settings → 200 PublicSettings. No code needed. */
export type PublicSettings = Settings & {
  /** False when the server has no TYPESAFE_API_KEY; the client then falls back to the simple length rule. */
  judgeAvailable: boolean;
};

// ---------------------------------------------------------------------------
// Clarifications: what the participant said while being grilled
// ---------------------------------------------------------------------------

/** The participant's own grill answers per step. Sent with build, tune and judge requests. */
export type Clarifications = Partial<Record<CoachStepId, string[]>>;

/** Matches LIMITS.message in validation.ts (kept here to avoid an import cycle). */
export const CLARIFICATION_MAX_CHARS = 4000;
export const CLARIFICATIONS_PER_STEP = 10;

const COACH_STEPS: readonly CoachStepId[] = ['who', 'why', 'success', 'bet', 'brief'];

/**
 * Each step's participant messages from its grill chat, minus the first one
 * (always the automatic "Grill me on my …" opener). Keeps the latest
 * CLARIFICATIONS_PER_STEP, each clamped. Steps with nothing are left out.
 */
export function clarificationsFrom(chats: Partial<Record<StepId, readonly ChatMessage[]>>): Clarifications {
  const out: Clarifications = {};
  for (const id of COACH_STEPS) {
    const answers = (chats[id] ?? [])
      .filter((m) => m.role === 'user')
      .slice(1)
      .map((m) => m.content.trim().slice(0, CLARIFICATION_MAX_CHARS))
      .filter((t) => t.length > 0)
      .slice(-CLARIFICATIONS_PER_STEP);
    if (answers.length > 0) out[id] = answers;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Judge (POST /api/judge)
// ---------------------------------------------------------------------------

/** Request: canvas as sent to /api/coach (canvasForRequest), plus that step's clarifications. */
export type JudgeRequest = { code: string; clientId: string; step: CoachStepId; canvas: Canvas; clarifications?: string[] };

export type JudgeCheck = {
  /** Stable id, e.g. "specific_user". */
  id: string;
  /** Participant-facing label in plain, warm British English, e.g. "Names a specific person or role". */
  label: string;
  /** Jev's probability that the check is met (0–1). */
  probability: number;
  pass: boolean;
  /** One short line saying how to fix a miss. Shown only when the check fails. */
  fix?: string;
};

export type Judgement = {
  step: CoachStepId;
  pass: boolean;
  checks: JudgeCheck[];
  /** stepFingerprint() of the fields that were judged. If the fields change, the judgement is stale. */
  fingerprint: string;
  /** Epoch ms. */
  at: number;
};

/** Response: 200 Judgement | 400/401/429 { error } | 503 { error } when the judge is not configured or failed. */
export type JudgeResponse = Judgement;

// ---------------------------------------------------------------------------
// Sync (POST /api/sync) — lets a facilitator see progress on /admin
// ---------------------------------------------------------------------------

export type SyncRequest = {
  code: string;
  clientId: string;
  /** Full canvas including chats, clamped by the client to validation LIMITS. */
  canvas: Canvas;
  /** Step ids the participant's browser currently counts as done. */
  done: StepId[];
};
/** Response: 204 on success; 400/401/429 { error }. */

// ---------------------------------------------------------------------------
// Admin (Authorization: Bearer <ADMIN_PASSWORD>)
// ---------------------------------------------------------------------------

/** GET /api/admin/participants → { participants: ParticipantSummary[] } (newest activity first). */
export type ParticipantSummary = {
  clientId: string;
  nickname: string;
  done: StepId[];
  /** Characters in the build prompt (0 = none yet). */
  buildPromptLength: number;
  updatedAt: number;
  createdAt: number;
};

/** GET /api/admin/participants/:clientId → { participant: ParticipantSummary, canvas: Canvas }. */
export type ParticipantDetail = { participant: ParticipantSummary; canvas: Canvas };

/** GET /api/admin/settings → Settings; PUT /api/admin/settings with Partial<Settings> → Settings. */

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * A short, stable fingerprint of a string (FNV-1a, hex). Not cryptographic;
 * only used to tell whether a step's fields changed since it was judged.
 */
export function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const ADJECTIVES = [
  'Amber', 'Brave', 'Bright', 'Calm', 'Clever', 'Coral', 'Curious', 'Daring', 'Eager', 'Gentle',
  'Golden', 'Happy', 'Jolly', 'Keen', 'Kind', 'Lively', 'Lucky', 'Merry', 'Mighty', 'Nimble',
  'Plucky', 'Quick', 'Quiet', 'Rosy', 'Sunny', 'Swift', 'Tidy', 'Witty', 'Zesty', 'Cosy',
];
const ANIMALS = [
  'Otter', 'Panda', 'Heron', 'Gecko', 'Koala', 'Lemur', 'Magpie', 'Marmot', 'Narwhal', 'Ocelot',
  'Penguin', 'Puffin', 'Quokka', 'Robin', 'Seal', 'Sloth', 'Tapir', 'Toucan', 'Walrus', 'Wombat',
  'Badger', 'Beaver', 'Dolphin', 'Ferret', 'Hedgehog', 'Ibis', 'Kiwi', 'Llama', 'Mole', 'Owl',
];

/** A friendly, stable nickname for an anonymous participant, e.g. "Coral Otter". */
export function nicknameFor(clientId: string): string {
  const h = parseInt(fingerprint(clientId), 16);
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${ANIMALS[Math.floor(h / ADJECTIVES.length) % ANIMALS.length]}`;
}

// ---------------------------------------------------------------------------
// Coach modes (POST /api/coach). The server owns every prompt; the client
// only names a mode.
// ---------------------------------------------------------------------------

/**
 * - nudge:       after a failed check, one short nudge and one question per miss (needs `step`, `failed`)
 * - questions:   the coach asks one question at a time about a step (needs `step`, `messages`)
 * - statement:   drafts the problem statement from screens 1 and 2
 * - assumptions: suggests three candidate riskiest assumptions
 * - brief:       writes the product brief (a ```fit block first, then the document)
 * - review:      critiques the participant's edited brief
 */
export const COACH_MODES = ['nudge', 'questions', 'statement', 'assumptions', 'brief', 'review'] as const;
export type CoachMode = (typeof COACH_MODES)[number];

/** Extra field on a `nudge` request: ids of the checks that failed, as returned by /api/judge. */
export type NudgeExtras = { failed: string[] };
