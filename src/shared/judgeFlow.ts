// What the client shows and does around the AI step checker. Pure: no IO.

import {
  COACH_STEP_IDS,
  currentJudgement,
  emptyRequiredFields,
  nothingLeftEmpty,
  isStepComplete,
  type Canvas,
  type CoachStepId,
  type CompletionMode,
  type StepId,
} from './canvas';
import type { JudgeCheck, Judgement } from './contracts';
import type { FieldDef } from './steps';

/**
 * How a step looks in the stepper. "filled" means every box has an answer but
 * the step has not passed yet; "almost" means the checker looked at the current
 * text and wants another go.
 */
export type StepStatus = 'done' | 'checking' | 'almost' | 'filled' | 'todo';

export const isCoachStep = (id: StepId): id is CoachStepId => (COACH_STEP_IDS as readonly string[]).includes(id);

export function stepStatus(canvas: Canvas, id: StepId, mode: CompletionMode, checking = false): StepStatus {
  if (isStepComplete(canvas, id, mode)) return 'done';
  if (mode.judge && checking) return 'checking';
  const judgement = currentJudgement(canvas, id);
  if (mode.judge && judgement && !judgement.pass) return 'almost';
  return nothingLeftEmpty(canvas, id) ? 'filled' : 'todo';
}

/** The checker looks at a step once no required box is empty. It judges quality itself. */
export function canCheck(canvas: Canvas, id: StepId): id is CoachStepId {
  return isCoachStep(id) && nothingLeftEmpty(canvas, id);
}

/** Run the checker on Next when the current text has not been looked at yet. */
export function needsAutoCheck(canvas: Canvas, id: StepId, mode: CompletionMode, checking: boolean): boolean {
  return mode.judge && !checking && canCheck(canvas, id) && currentJudgement(canvas, id) === undefined;
}

// ---------------------------------------------------------------------------
// Empty boxes
// ---------------------------------------------------------------------------

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/** A box's name in a list: the plain label, with the numbered form for the repeated whys. */
export const listLabel = (field: FieldDef): string => field.exportLabel ?? field.label;

/** "Two boxes still need an answer: A, B". Empty when nothing is missing. */
export function emptyBoxesMessage(canvas: Canvas, id: StepId): string {
  const labels = emptyRequiredFields(canvas, id).map(listLabel);
  if (labels.length === 0) return '';
  const count = NUMBER_WORDS[labels.length] ?? String(labels.length);
  const phrase = labels.length === 1 ? 'box still needs' : 'boxes still need';
  return `${count} ${phrase} an answer: ${labels.join(', ')}`;
}

// ---------------------------------------------------------------------------
// The result card
// ---------------------------------------------------------------------------

export type JudgeView =
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'stale'; previous: Judgement }
  | { kind: 'result'; judgement: Judgement };

/** What the result card below a step should show. */
export function judgeView(canvas: Canvas, id: CoachStepId, checking: boolean): JudgeView {
  if (checking) return { kind: 'checking' };
  const latest = canvas.judgements[id];
  if (!latest) return { kind: 'none' };
  const current = currentJudgement(canvas, id);
  return current ? { kind: 'result', judgement: current } : { kind: 'stale', previous: latest };
}

export const missedChecks = (j: Judgement): JudgeCheck[] => j.checks.filter((c) => !c.pass);

/** The line that says how to fix a miss; the check's label if the checker sent no fix. */
export const fixLine = (check: JudgeCheck): string => check.fix?.trim() || check.label;

export type JudgeCardContent = {
  tone: 'pass' | 'miss' | 'fail';
  headline: string;
  /** One fix line per missed check. Empty on a clean pass. */
  lines: string[];
};

export function judgeCard(j: Judgement, stepDone = true): JudgeCardContent {
  const misses = missedChecks(j);
  const lines = misses.map(fixLine);
  if (!j.pass) return { tone: 'fail', headline: 'Nearly there. Fix these, then check again:', lines };
  const lead = stepDone ? 'Done' : 'These boxes look good';
  if (misses.length === 0) return { tone: 'pass', headline: stepDone ? 'Done. Nice work.' : 'These boxes look good.', lines: [] };
  return { tone: 'miss', headline: misses.length === 1 ? `${lead}. One thing worth a look:` : `${lead}. Things worth a look:`, lines };
}

// ---------------------------------------------------------------------------
// The nudge that follows a miss
// ---------------------------------------------------------------------------

/** The most check ids a nudge request may carry (matches the server). */
export const NUDGE_MAX_FAILED = 6;

/** Ids of the missed checks, in the order the checker returned them. */
export const failedCheckIds = (j: Judgement): string[] =>
  missedChecks(j)
    .map((c) => c.id)
    .slice(0, NUDGE_MAX_FAILED);

/** One nudge per judgement: ask when something was missed and this text has not been nudged yet. */
export function shouldNudge(j: Judgement, nudgedFingerprint: string | undefined): boolean {
  return failedCheckIds(j).length > 0 && nudgedFingerprint !== j.fingerprint;
}
