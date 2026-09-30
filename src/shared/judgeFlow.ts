// What the client shows and does around the AI step checker. Pure: no IO.

import {
  COACH_STEP_IDS,
  currentJudgement,
  filledEnough,
  isStepComplete,
  type Canvas,
  type CoachStepId,
  type CompletionMode,
  type StepId,
} from './canvas';
import type { Judgement } from './contracts';

export type StepStatus = 'done' | 'checking' | 'almost' | 'todo';

export const isCoachStep = (id: StepId): id is CoachStepId => (COACH_STEP_IDS as readonly string[]).includes(id);

/**
 * How a step looks in the stepper. "almost" means the checker looked at the
 * current text and wants another go. Only meaningful when the checker is on.
 */
export function stepStatus(canvas: Canvas, id: StepId, mode: CompletionMode, checking = false): StepStatus {
  if (isStepComplete(canvas, id, mode)) return 'done';
  if (!mode.judge || !isCoachStep(id)) return 'todo';
  if (checking) return 'checking';
  return currentJudgement(canvas, id) ? 'almost' : 'todo';
}

/** The checker only looks at a step once the ordinary length rule is met. */
export function canCheck(canvas: Canvas, id: StepId): id is CoachStepId {
  return isCoachStep(id) && filledEnough(canvas, id);
}

/** Run the checker on Next when the current text has not been looked at yet. */
export function needsAutoCheck(canvas: Canvas, id: StepId, mode: CompletionMode, checking: boolean): boolean {
  return mode.judge && !checking && canCheck(canvas, id) && currentJudgement(canvas, id) === undefined;
}

export type JudgeView =
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'stale'; previous: Judgement }
  | { kind: 'result'; judgement: Judgement };

/** What the checklist card below a step should show. */
export function judgeView(canvas: Canvas, id: CoachStepId, checking: boolean): JudgeView {
  if (checking) return { kind: 'checking' };
  const latest = canvas.judgements[id];
  if (!latest) return { kind: 'none' };
  const current = currentJudgement(canvas, id);
  return current ? { kind: 'result', judgement: current } : { kind: 'stale', previous: latest };
}

/** The sentence at the top of the checklist card. */
export function judgeHeadline(j: Judgement): string {
  if (!j.pass) return 'Almost there. Have a look at the unticked items, then check again.';
  return j.checks.every((c) => c.pass)
    ? 'Nice work. This step is done.'
    : 'Nice work. This step is done. The unticked item is worth a look if you have a moment.';
}
