// Canvas data model (v2) and the pure rules around it. No IO in here.
//
// Five screens: who → why → success → bet → brief. Each fact is typed once and
// carried forward; the AI assembles the write-up from them.

import { fingerprint, type Judgement } from './contracts';
import { STEPS, getStep, type FieldDef } from './steps';

export const STEP_IDS = ['who', 'why', 'success', 'bet', 'brief'] as const;
export type StepId = (typeof STEP_IDS)[number];

/** Every step is checked and can be questioned by the coach. Kept as its own name for readability. */
export const COACH_STEP_IDS = STEP_IDS;
export type CoachStepId = StepId;

/** The four thinking steps that come before the brief. */
export const THINKING_STEP_IDS = ['who', 'why', 'success', 'bet'] as const;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type Platform = 'claude-code' | 'codex' | 'cursor' | 'lovable' | 'other';
export const PLATFORMS: readonly Platform[] = ['claude-code', 'codex', 'cursor', 'lovable', 'other'];

export type Canvas = {
  who: { who: string; pain: string; evidence: string; parkedIdea: string };
  why: { whys: string[]; consequence: string; statement: string };
  success: { metric: string; today: string; target: string; guardrail: string };
  bet: { assumption: string; test: string; passMark: string };
  brief: {
    firstTwoMinutes: string;
    unhappyPath: string;
    where: string;
    /** Asked only when no idea was parked on the first screen. */
    smallestBuild: string;
    platform: Platform;
    otherPlatform: string;
    /** Pal's view on whether the parked idea still tests the riskiest bet. */
    fit: string;
    /** The finished product brief (the PRD), editable. */
    document: string;
  };
  chats: Record<StepId, ChatMessage[]>;
  /** The AI judge's latest verdict per step. Stale once the step's fields change. */
  judgements: Partial<Record<StepId, Judgement>>;
  /** When they joined and first typed (epoch ms; 0 = not yet). Helps a facilitator spot who is stuck at the start. */
  meta: { joinedAt: number; firstInputAt: number };
};

/** Whys shown at first, and the most a participant can add. */
export const WHY_REQUIRED = 3;
export const WHY_COUNT = 5;

export function emptyChats(): Record<StepId, ChatMessage[]> {
  return { who: [], why: [], success: [], bet: [], brief: [] };
}

export function emptyCanvas(): Canvas {
  return {
    who: { who: '', pain: '', evidence: '', parkedIdea: '' },
    why: { whys: Array.from({ length: WHY_COUNT }, () => ''), consequence: '', statement: '' },
    success: { metric: '', today: '', target: '', guardrail: '' },
    bet: { assumption: '', test: '', passMark: '' },
    brief: {
      firstTwoMinutes: '',
      unhappyPath: '',
      where: '',
      smallestBuild: '',
      platform: 'claude-code',
      otherPlatform: '',
      fit: '',
      document: '',
    },
    chats: emptyChats(),
    judgements: {},
    meta: { joinedAt: 0, firstInputAt: 0 },
  };
}

/** Count of non-whitespace characters. */
export function nonSpaceLength(text: string): number {
  return text.replace(/\s+/g, '').length;
}

// ---------------------------------------------------------------------------
// Field access. Field ids are the keys in the step data; the whys use
// "whys.0" … "whys.4".
// ---------------------------------------------------------------------------

export function getField(canvas: Canvas, stepId: StepId, fieldId: string): string {
  if (stepId === 'why' && fieldId.startsWith('whys.')) {
    const index = Number(fieldId.slice(5));
    return canvas.why.whys[index] ?? '';
  }
  const section = canvas[stepId] as unknown as Record<string, unknown>;
  const value = section[fieldId];
  return typeof value === 'string' ? value : '';
}

export function setField(canvas: Canvas, stepId: StepId, fieldId: string, value: string): Canvas {
  if (stepId === 'why' && fieldId.startsWith('whys.')) {
    const index = Number(fieldId.slice(5));
    const whys = [...canvas.why.whys];
    while (whys.length < WHY_COUNT) whys.push('');
    whys[index] = value;
    return { ...canvas, why: { ...canvas.why, whys } };
  }
  const section = canvas[stepId] as unknown as Record<string, unknown>;
  return { ...canvas, [stepId]: { ...section, [fieldId]: value } } as Canvas;
}

/** Longest earlier answer to quote inside a label before it is cut short. */
const QUOTE_MAX = 90;

/**
 * The label to show for a box. Boxes that build on an earlier answer quote it,
 * so "why?" always points at the participant's own words.
 */
export function fieldLabel(canvas: Canvas, field: FieldDef): string {
  if (!field.quote) return field.label;
  const dot = field.quote.from.indexOf('.');
  const stepId = field.quote.from.slice(0, dot) as StepId;
  const quoted = getField(canvas, stepId, field.quote.from.slice(dot + 1)).trim().replace(/\s+/g, ' ');
  if (!quoted) return field.label;
  const short = quoted.length > QUOTE_MAX ? `${quoted.slice(0, QUOTE_MAX - 1).trimEnd()}…` : quoted;
  return field.quote.template.replace('{quote}', short);
}

/** Has the participant typed anything at all into the thinking boxes? */
export function hasAnyInput(canvas: Canvas): boolean {
  return STEPS.some((step) => step.fields.some((f) => nonSpaceLength(getField(canvas, step.id, f.id)) > 0));
}

// ---------------------------------------------------------------------------
// Which boxes are required
// ---------------------------------------------------------------------------

/**
 * A box is required when its definition says so. One box is conditional:
 * "the smallest thing you'd build" is only asked when no idea was parked.
 */
export function isFieldRequired(canvas: Canvas, field: FieldDef): boolean {
  if (field.requiredUnlessParked) return nonSpaceLength(canvas.who.parkedIdea) === 0;
  return field.required;
}

/** Should this box be shown at all? (The conditional box hides when an idea was parked.) */
export function isFieldShown(canvas: Canvas, field: FieldDef): boolean {
  if (field.requiredUnlessParked) return nonSpaceLength(canvas.who.parkedIdea) === 0;
  return true;
}

export function requiredFields(canvas: Canvas, stepId: StepId): FieldDef[] {
  return getStep(stepId).fields.filter((f) => isFieldRequired(canvas, f));
}

// ---------------------------------------------------------------------------
// Completion rules
// ---------------------------------------------------------------------------

/** With the judge off, a box counts once it has a few real characters in it. */
const MIN_FIELD = 10;
/** A brief shorter than this is not a brief yet. */
const MIN_DOCUMENT = 200;

/** The boxes of a step that the checker looks at: shown, and not marked `judged: false`. */
export function judgedFields(canvas: Canvas, stepId: StepId): FieldDef[] {
  return getStep(stepId).fields.filter((f) => isFieldShown(canvas, f) && f.judged !== false);
}

/** Everything the checker looks at for a step, as one string (for fingerprints and the judge). */
export function stepText(canvas: Canvas, stepId: StepId): string {
  return judgedFields(canvas, stepId)
    .map((f) => `${f.id}=${getField(canvas, stepId, f.id).trim()}`)
    .join('\n');
}

export function stepFingerprint(canvas: Canvas, stepId: StepId): string {
  return fingerprint(stepText(canvas, stepId));
}

/** The judge's verdict for a step, if there is one and the fields haven't changed since. */
export function currentJudgement(canvas: Canvas, stepId: StepId): Judgement | undefined {
  const j = canvas.judgements[stepId];
  return j && j.fingerprint === stepFingerprint(canvas, stepId) ? j : undefined;
}

export type CompletionMode = { judge: boolean };

/** Every required box of the step has at least `min` real characters. */
export function filledEnough(canvas: Canvas, stepId: StepId, min: number = MIN_FIELD): boolean {
  return requiredFields(canvas, stepId).every((f) => nonSpaceLength(getField(canvas, stepId, f.id)) >= min);
}

/**
 * Every required box has at least something in it. This is all the AI judge
 * needs before it looks: short answers such as "1 out of 2" are fine, and the
 * judge, not a character count, decides whether they are good enough.
 */
export function nothingLeftEmpty(canvas: Canvas, stepId: StepId): boolean {
  return filledEnough(canvas, stepId, 1);
}

/** The required boxes of a step that are still empty (for "fill these first" messages). */
export function emptyRequiredFields(canvas: Canvas, stepId: StepId): FieldDef[] {
  return requiredFields(canvas, stepId).filter((f) => nonSpaceLength(getField(canvas, stepId, f.id)) === 0);
}

/** Are the step's own boxes in good shape? (For the brief step this ignores the document.) */
export function isStepInputDone(canvas: Canvas, stepId: StepId, mode: CompletionMode = { judge: false }): boolean {
  if (mode.judge) return nothingLeftEmpty(canvas, stepId) && currentJudgement(canvas, stepId)?.pass === true;
  return filledEnough(canvas, stepId);
}

export function hasDocument(canvas: Canvas): boolean {
  return nonSpaceLength(canvas.brief.document) >= MIN_DOCUMENT;
}

/**
 * The four thinking steps are done when their boxes are (judged, if the judge
 * is on). The brief step is done when the brief has been written.
 */
export function isStepComplete(canvas: Canvas, stepId: StepId, mode: CompletionMode = { judge: false }): boolean {
  if (stepId === 'brief') return hasDocument(canvas);
  return isStepInputDone(canvas, stepId, mode);
}

export function completedCount(canvas: Canvas, mode: CompletionMode = { judge: false }): number {
  return STEP_IDS.filter((id) => isStepComplete(canvas, id, mode)).length;
}

/**
 * What still stands between the participant and a well-founded brief: thinking
 * steps not yet done, plus the brief screen's own boxes.
 */
export function missingBeforeBrief(canvas: Canvas, mode: CompletionMode = { judge: false }): StepId[] {
  const missing: StepId[] = THINKING_STEP_IDS.filter((id) => !isStepInputDone(canvas, id, mode));
  if (!isStepInputDone(canvas, 'brief', mode)) missing.push('brief');
  return missing;
}

// ---------------------------------------------------------------------------
// Loading untrusted data (localStorage, the database) into a well-formed
// canvas. Also upgrades a canvas saved by the first version of the app.
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function obj(raw: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = raw[key];
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function normaliseChatList(list: unknown): ChatMessage[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (m): m is ChatMessage =>
        typeof m === 'object' && m !== null &&
        ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') &&
        typeof (m as ChatMessage).content === 'string',
    )
    .map((m) => ({ role: m.role, content: m.content }));
}

function normalisePlatform(value: unknown): Platform {
  return PLATFORMS.includes(value as Platform) ? (value as Platform) : 'claude-code';
}

function normaliseWhys(value: unknown): string[] {
  const whys = Array.isArray(value) ? value.map(str) : [];
  while (whys.length < WHY_COUNT) whys.push('');
  return whys.slice(0, WHY_COUNT);
}

/** The first version stored idea / problem / metric / assumption / experience / build. */
function isV1(raw: Record<string, unknown>): boolean {
  return raw.who === undefined && (raw.idea !== undefined || raw.problem !== undefined || raw.build !== undefined);
}

function upgradeV1(raw: Record<string, unknown>): Canvas {
  const base = emptyCanvas();
  const idea = obj(raw, 'idea');
  const why = obj(raw, 'why');
  const problem = obj(raw, 'problem');
  const metric = obj(raw, 'metric');
  const assumption = obj(raw, 'assumption');
  const experience = obj(raw, 'experience');
  const build = obj(raw, 'build');
  const chatsRaw = obj(raw, 'chats');
  return {
    who: {
      who: str(idea.who),
      pain: str(idea.pain),
      evidence: str(problem.confirmation),
      parkedIdea: str(idea.oneLine) || str(idea.wish),
    },
    why: {
      whys: normaliseWhys(why.whys),
      consequence: str(problem.consequence),
      statement: str(problem.statement) || str(why.statement),
    },
    success: {
      metric: str(metric.primary),
      today: str(metric.baseline),
      target: str(metric.target),
      guardrail: str(metric.guardrail),
    },
    bet: { assumption: str(assumption.riskiest), test: str(assumption.test), passMark: str(assumption.threshold) },
    brief: {
      ...base.brief,
      firstTwoMinutes: str(experience.firstTwoMinutes),
      unhappyPath: str(experience.unhappyPath),
      where: str(experience.where),
      platform: normalisePlatform(build.platform),
      otherPlatform: str(build.otherPlatform),
      document: str(build.prompt),
    },
    chats: {
      who: normaliseChatList(chatsRaw.idea),
      why: normaliseChatList(chatsRaw.why),
      success: normaliseChatList(chatsRaw.metric),
      bet: normaliseChatList(chatsRaw.assumption),
      brief: normaliseChatList(chatsRaw.experience),
    },
    // Old verdicts were about different boxes, so they are dropped.
    judgements: {},
    meta: base.meta,
  };
}

export function normaliseCanvas(input: unknown): Canvas {
  const base = emptyCanvas();
  if (typeof input !== 'object' || input === null) return base;
  const raw = input as Record<string, unknown>;
  if (isV1(raw)) return upgradeV1(raw);

  const copy = <T extends Record<string, string>>(target: T, source: Record<string, unknown>): T => {
    const out: Record<string, string> = { ...target };
    for (const key of Object.keys(target)) out[key] = str(source[key]);
    return out as T;
  };

  const whyRaw = obj(raw, 'why');
  const briefRaw = obj(raw, 'brief');
  const chatsRaw = obj(raw, 'chats');
  const metaRaw = obj(raw, 'meta');
  const chats = emptyChats();
  for (const id of STEP_IDS) chats[id] = normaliseChatList(chatsRaw[id]);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

  return {
    who: copy(base.who, obj(raw, 'who')),
    why: { whys: normaliseWhys(whyRaw.whys), consequence: str(whyRaw.consequence), statement: str(whyRaw.statement) },
    success: copy(base.success, obj(raw, 'success')),
    bet: copy(base.bet, obj(raw, 'bet')),
    brief: {
      firstTwoMinutes: str(briefRaw.firstTwoMinutes),
      unhappyPath: str(briefRaw.unhappyPath),
      where: str(briefRaw.where),
      smallestBuild: str(briefRaw.smallestBuild),
      platform: normalisePlatform(briefRaw.platform),
      otherPlatform: str(briefRaw.otherPlatform),
      fit: str(briefRaw.fit),
      document: str(briefRaw.document),
    },
    chats,
    judgements: normaliseJudgements(raw.judgements),
    meta: { joinedAt: num(metaRaw.joinedAt), firstInputAt: num(metaRaw.firstInputAt) },
  };
}

export function normaliseJudgements(input: unknown): Canvas['judgements'] {
  const out: Canvas['judgements'] = {};
  if (typeof input !== 'object' || input === null) return out;
  const raw = input as Record<string, unknown>;
  for (const id of STEP_IDS) {
    const j = raw[id] as Partial<Judgement> | undefined;
    if (!j || typeof j !== 'object' || typeof j.pass !== 'boolean' || typeof j.fingerprint !== 'string' || !Array.isArray(j.checks)) continue;
    out[id] = {
      step: id,
      pass: j.pass,
      fingerprint: j.fingerprint,
      at: typeof j.at === 'number' ? j.at : 0,
      checks: j.checks
        .filter((c) => c && typeof c.id === 'string' && typeof c.label === 'string' && typeof c.probability === 'number')
        .map((c) => ({
          id: c.id,
          label: c.label,
          probability: c.probability,
          pass: Boolean(c.pass),
          ...(typeof c.fix === 'string' ? { fix: c.fix } : {}),
        })),
    };
  }
  return out;
}

/** Step ids from the first version, mapped to today's (for old rows in the database). */
const OLD_STEP_IDS: Record<string, StepId> = {
  idea: 'who',
  problem: 'why',
  metric: 'success',
  assumption: 'bet',
  // The old experience step had no document, so finishing it does not mean the brief is done.
  build: 'brief',
};

export function normaliseDone(input: unknown): StepId[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<StepId>();
  for (const value of input) {
    if (typeof value !== 'string') continue;
    if ((STEP_IDS as readonly string[]).includes(value)) out.add(value as StepId);
    else if (OLD_STEP_IDS[value]) out.add(OLD_STEP_IDS[value]);
  }
  return STEP_IDS.filter((id) => out.has(id));
}

// ---------------------------------------------------------------------------
// Markdown export: the participant's notes, then the brief.
// ---------------------------------------------------------------------------

export function platformLabel(canvas: Canvas): string {
  switch (canvas.brief.platform) {
    case 'claude-code':
      return 'Claude Code';
    case 'codex':
      return 'Codex';
    case 'cursor':
      return 'Cursor';
    case 'lovable':
      return 'Lovable';
    default:
      return canvas.brief.otherPlatform.trim() || 'another AI coding tool';
  }
}

export function canvasToMarkdown(canvas: Canvas): string {
  const lines: string[] = [];
  const document = canvas.brief.document.trim();
  if (document) lines.push(document, '', '---', '');
  lines.push('# My notes', '');
  for (const step of STEPS) {
    lines.push(`## ${step.number}. ${step.title}`, '');
    let any = false;
    for (const field of step.fields) {
      const value = getField(canvas, step.id, field.id).trim();
      if (!value) continue;
      any = true;
      lines.push(`**${field.exportLabel ?? field.label}**`, '', value, '');
    }
    if (!any) lines.push('_Not filled in yet._', '');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
