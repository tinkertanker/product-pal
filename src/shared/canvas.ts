// Canvas data model and the pure rules around it. No IO in here.

import { fingerprint, type Judgement } from './contracts';
import { STEPS, getStep } from './steps';

export const STEP_IDS = ['idea', 'why', 'problem', 'metric', 'assumption', 'experience', 'build'] as const;
export type StepId = (typeof STEP_IDS)[number];

/** Steps the coach can challenge or grill (everything before the build prompt). */
export const COACH_STEP_IDS = ['idea', 'why', 'problem', 'metric', 'assumption', 'experience'] as const;
export type CoachStepId = (typeof COACH_STEP_IDS)[number];

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type Platform = 'claude-code' | 'codex' | 'cursor' | 'lovable' | 'other';
export const PLATFORMS: readonly Platform[] = ['claude-code', 'codex', 'cursor', 'lovable', 'other'];

export type Canvas = {
  idea: { who: string; pain: string; wish: string; oneLine: string };
  why: { whys: string[]; statement: string };
  problem: { clarity: string; consequence: string; cause: string; confirmation: string; statement: string };
  metric: { primary: string; baseline: string; target: string; guardrail: string };
  assumption: { list: string; riskiest: string; test: string; threshold: string };
  experience: { where: string; firstTwoMinutes: string; unhappyPath: string; elevenStar: string };
  build: { platform: Platform; otherPlatform: string; includeGrill: boolean; prompt: string };
  chats: Record<StepId, ChatMessage[]>;
  /** The AI judge's latest verdict per step. Stale once the step's fields change. */
  judgements: Partial<Record<CoachStepId, Judgement>>;
};

export const WHY_COUNT = 5;

export function emptyChats(): Record<StepId, ChatMessage[]> {
  return { idea: [], why: [], problem: [], metric: [], assumption: [], experience: [], build: [] };
}

export function emptyCanvas(): Canvas {
  return {
    idea: { who: '', pain: '', wish: '', oneLine: '' },
    why: { whys: Array.from({ length: WHY_COUNT }, () => ''), statement: '' },
    problem: { clarity: '', consequence: '', cause: '', confirmation: '', statement: '' },
    metric: { primary: '', baseline: '', target: '', guardrail: '' },
    assumption: { list: '', riskiest: '', test: '', threshold: '' },
    experience: { where: '', firstTwoMinutes: '', unhappyPath: '', elevenStar: '' },
    build: { platform: 'claude-code', otherPlatform: '', includeGrill: true, prompt: '' },
    chats: emptyChats(),
    judgements: {},
  };
}

/** Count of non-whitespace characters. */
export function nonSpaceLength(text: string): number {
  return text.replace(/\s+/g, '').length;
}

// ---------------------------------------------------------------------------
// Field access. Field ids are the keys in the step data; the five whys use
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

// ---------------------------------------------------------------------------
// Completion rules
// ---------------------------------------------------------------------------

const MIN_FIELD = 10;
const MIN_CHALLENGE = 15;

/** Everything the participant wrote for a step, as one string (for fingerprints and the judge). */
export function stepText(canvas: Canvas, stepId: CoachStepId): string {
  return getStep(stepId)
    .fields.map((f) => `${f.id}=${getField(canvas, stepId, f.id).trim()}`)
    .join('\n');
}

export function stepFingerprint(canvas: Canvas, stepId: CoachStepId): string {
  return fingerprint(stepText(canvas, stepId));
}

/** The judge's verdict for a step, if there is one and the fields haven't changed since. */
export function currentJudgement(canvas: Canvas, stepId: CoachStepId): Judgement | undefined {
  const j = canvas.judgements[stepId];
  return j && j.fingerprint === stepFingerprint(canvas, stepId) ? j : undefined;
}

export type CompletionMode = { judge: boolean };

/**
 * With the judge on, steps 1–6 are done only when the judge passed the current
 * text. Otherwise (or for the build step) the simple length rule applies.
 */
export function isStepComplete(canvas: Canvas, stepId: StepId, mode: CompletionMode = { judge: false }): boolean {
  if (stepId !== 'build' && mode.judge) return filledEnough(canvas, stepId) && currentJudgement(canvas, stepId)?.pass === true;
  return filledEnough(canvas, stepId);
}

/** The length rule: every required box has something real in it. */
export function filledEnough(canvas: Canvas, stepId: StepId): boolean {
  if (stepId === 'build') return nonSpaceLength(canvas.build.prompt) >= MIN_FIELD;
  const step = getStep(stepId);
  if (stepId === 'why') {
    const filled = canvas.why.whys.filter((w) => nonSpaceLength(w) >= MIN_FIELD).length;
    return filled >= 3 && nonSpaceLength(canvas.why.statement) >= MIN_FIELD;
  }
  return step.fields
    .filter((f) => f.required)
    .every((f) => nonSpaceLength(getField(canvas, stepId, f.id)) >= MIN_FIELD);
}

/** The step's main field has enough in it for the coach to say something useful. */
export function canChallenge(canvas: Canvas, stepId: StepId): boolean {
  if (stepId === 'build') return false;
  const main = getStep(stepId).fields.find((f) => f.main);
  if (!main) return false;
  return getField(canvas, stepId, main.id).trim().length >= MIN_CHALLENGE;
}

export function completedCount(canvas: Canvas, mode: CompletionMode = { judge: false }): number {
  return STEPS.filter((s) => isStepComplete(canvas, s.id, mode)).length;
}

/** Steps 1–6 that are not complete yet (for the build step's "missing" list). */
export function missingCoachSteps(canvas: Canvas, mode: CompletionMode = { judge: false }): CoachStepId[] {
  return COACH_STEP_IDS.filter((id) => !isStepComplete(canvas, id, mode));
}

// ---------------------------------------------------------------------------
// Loading untrusted data (localStorage) into a well-formed canvas.
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function normaliseCanvas(input: unknown): Canvas {
  const base = emptyCanvas();
  if (typeof input !== 'object' || input === null) return base;
  const raw = input as Record<string, unknown>;
  const obj = (key: string): Record<string, unknown> =>
    typeof raw[key] === 'object' && raw[key] !== null ? (raw[key] as Record<string, unknown>) : {};

  const copy = <T extends Record<string, string>>(target: T, source: Record<string, unknown>): T => {
    const out: Record<string, string> = { ...target };
    for (const key of Object.keys(target)) out[key] = str(source[key]);
    return out as T;
  };

  const whyRaw = obj('why');
  const whys = Array.isArray(whyRaw.whys) ? whyRaw.whys.map(str) : [];
  while (whys.length < WHY_COUNT) whys.push('');

  const buildRaw = obj('build');
  const platform = PLATFORMS.includes(buildRaw.platform as Platform) ? (buildRaw.platform as Platform) : 'claude-code';

  const chats = emptyChats();
  const chatsRaw = obj('chats');
  for (const id of STEP_IDS) {
    const list = chatsRaw[id];
    if (!Array.isArray(list)) continue;
    chats[id] = list
      .filter(
        (m): m is ChatMessage =>
          typeof m === 'object' && m !== null &&
          ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') &&
          typeof (m as ChatMessage).content === 'string',
      )
      .map((m) => ({ role: m.role, content: m.content }));
  }

  return {
    idea: copy(base.idea, obj('idea')),
    why: { whys: whys.slice(0, WHY_COUNT), statement: str(whyRaw.statement) },
    problem: copy(base.problem, obj('problem')),
    metric: copy(base.metric, obj('metric')),
    assumption: copy(base.assumption, obj('assumption')),
    experience: copy(base.experience, obj('experience')),
    build: {
      platform,
      otherPlatform: str(buildRaw.otherPlatform),
      includeGrill: typeof buildRaw.includeGrill === 'boolean' ? buildRaw.includeGrill : true,
      prompt: str(buildRaw.prompt),
    },
    chats,
    judgements: normaliseJudgements(raw.judgements),
  };
}

export function normaliseJudgements(input: unknown): Canvas['judgements'] {
  const out: Canvas['judgements'] = {};
  if (typeof input !== 'object' || input === null) return out;
  const raw = input as Record<string, unknown>;
  for (const id of COACH_STEP_IDS) {
    const j = raw[id] as Partial<Judgement> | undefined;
    if (!j || typeof j !== 'object' || typeof j.pass !== 'boolean' || typeof j.fingerprint !== 'string' || !Array.isArray(j.checks)) continue;
    out[id] = {
      step: id,
      pass: j.pass,
      fingerprint: j.fingerprint,
      at: typeof j.at === 'number' ? j.at : 0,
      checks: j.checks
        .filter((c) => c && typeof c.id === 'string' && typeof c.label === 'string' && typeof c.probability === 'number')
        .map((c) => ({ id: c.id, label: c.label, probability: c.probability, pass: Boolean(c.pass) })),
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Markdown export
// ---------------------------------------------------------------------------

export function platformLabel(canvas: Canvas): string {
  switch (canvas.build.platform) {
    case 'claude-code':
      return 'Claude Code';
    case 'codex':
      return 'Codex';
    case 'cursor':
      return 'Cursor';
    case 'lovable':
      return 'Lovable';
    default:
      return canvas.build.otherPlatform.trim() || 'another AI coding tool';
  }
}

/** A code fence longer than any run of backticks inside the text. */
function fenceFor(text: string): string {
  const longest = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

export function canvasToMarkdown(canvas: Canvas): string {
  const lines: string[] = ['# Product canvas', ''];
  for (const step of STEPS) {
    lines.push(`## ${step.number}. ${step.title}`, '');
    if (step.id === 'build') {
      lines.push(`**Coding tool:** ${platformLabel(canvas)}`, '');
      const prompt = canvas.build.prompt.trim();
      if (prompt) {
        const fence = fenceFor(prompt);
        lines.push('**Build prompt**', '', `${fence}markdown`, prompt, fence, '');
      } else {
        lines.push('_Not written yet._', '');
      }
      continue;
    }
    let any = false;
    for (const field of step.fields) {
      const value = getField(canvas, step.id, field.id).trim();
      if (!value) continue;
      any = true;
      lines.push(`**${field.label}**`, '', value, '');
    }
    if (!any) lines.push('_Not filled in yet._', '');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
