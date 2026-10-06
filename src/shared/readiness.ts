// Is there enough on the canvas to be worth a paid call? Pure: canvas in, message out.

import { getField, hasAnyInput, nonSpaceLength, nothingLeftEmpty, type Canvas, type CoachStepId } from './canvas';

export type PaidCall =
  | { kind: 'judge'; step: CoachStepId }
  | { kind: 'statement' }
  | { kind: 'assumptions' }
  | { kind: 'brief' };

const has = (canvas: Canvas, step: 'who' | 'why', field: string) => nonSpaceLength(getField(canvas, step, field)) > 0;

/** A friendly reason to refuse, or null when there is enough to go on. */
export function missingInput(call: PaidCall, canvas: Canvas): string | null {
  switch (call.kind) {
    case 'judge':
      return nothingLeftEmpty(canvas, call.step) ? null : 'Fill in every box on this screen before the step checker looks at it.';
    case 'statement':
      return has(canvas, 'who', 'who') && has(canvas, 'who', 'pain') && ['whys.0', 'whys.1', 'whys.2'].every((id) => has(canvas, 'why', id))
        ? null
        : 'Fill in who it is for, what is hard for them and your first three whys before drafting the statement.';
    case 'assumptions':
      return has(canvas, 'who', 'who') && has(canvas, 'who', 'pain')
        ? null
        : 'Fill in who it is for and what is hard for them before asking for assumptions.';
    case 'brief':
      return hasAnyInput(canvas) ? null : 'Fill in some of your boxes before writing the brief.';
  }
}
