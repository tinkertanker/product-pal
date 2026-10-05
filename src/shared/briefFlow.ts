// Small pure rules the screens lean on: which boxes to show, when Pal can draft
// the problem statement, the question chat's opening line, and the join and
// first-typing timestamps. No IO.

import { getField, hasAnyInput, isFieldShown, nonSpaceLength, type Canvas, type Platform, type StepId } from './canvas';
import { getStep, type FieldDef, type StepDef } from './steps';
import { listLabel } from './judgeFlow';

// ---------------------------------------------------------------------------
// Brief screen
// ---------------------------------------------------------------------------

export const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'lovable', label: 'Lovable' },
  { value: 'other', label: 'Other' },
];

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// ---------------------------------------------------------------------------
// "Draft it for me": the problem statement
// ---------------------------------------------------------------------------

/** The boxes Pal reads to draft the statement: who, the pain, the first three whys and the consequence. */
const STATEMENT_INPUTS: { step: StepId; field: string }[] = [
  { step: 'who', field: 'who' },
  { step: 'who', field: 'pain' },
  { step: 'why', field: 'whys.0' },
  { step: 'why', field: 'whys.1' },
  { step: 'why', field: 'whys.2' },
  { step: 'why', field: 'consequence' },
];

/** Boxes still empty that Pal needs before it can draft the statement. */
export function statementMissing(canvas: Canvas): FieldDef[] {
  const out: FieldDef[] = [];
  for (const { step, field } of STATEMENT_INPUTS) {
    const def = getStep(step).fields.find((f) => f.id === field);
    if (def && nonSpaceLength(getField(canvas, step, field)) === 0) out.push(def);
  }
  return out;
}

/** The line shown when the participant asks for a draft too early. Empty when Pal can go ahead. */
export function statementMissingMessage(canvas: Canvas): string {
  const missing = statementMissing(canvas);
  return missing.length === 0 ? '' : `Pal needs these first: ${missing.map(listLabel).join(', ')}`;
}

// ---------------------------------------------------------------------------
// "Ask me questions"
// ---------------------------------------------------------------------------

const OPENER_PREFIX = 'Ask me questions about my';

/** The first user turn, sent automatically. */
export const questionsOpener = (step: StepId): string => `${OPENER_PREFIX} ${getStep(step).shortTitle}.`;

/** Is this the automatic opener (or the old "Grill me on my" one from an earlier save)? */
export const isQuestionsOpener = (text: string): boolean => text.startsWith(OPENER_PREFIX) || text.startsWith('Grill me on my');

// ---------------------------------------------------------------------------
// "More" boxes
// ---------------------------------------------------------------------------

const filled = (canvas: Canvas, step: StepDef, field: FieldDef): boolean => nonSpaceLength(getField(canvas, step.id, field.id)) > 0;

/**
 * The boxes to show. A `more` box appears once it has text or the participant
 * has asked for it. On the Why screen the link reveals one more why at a time
 * (`revealed` counts how many); elsewhere one click reveals them all.
 */
export function visibleFields(canvas: Canvas, step: StepDef, revealed: number): FieldDef[] {
  const more = step.fields.filter((f) => f.more && isFieldShown(canvas, f));
  const sequential = step.id === 'why';
  return step.fields.filter((f) => {
    if (!isFieldShown(canvas, f)) return false;
    if (!f.more || filled(canvas, step, f)) return true;
    return sequential ? more.indexOf(f) < revealed : revealed > 0;
  });
}

/** What clicking the link does: the new `revealed` count and the box that appeared. Null when nothing is left to show. */
export function revealNext(canvas: Canvas, step: StepDef, revealed: number): { revealed: number; fieldId: string } | null {
  const shown = new Set(visibleFields(canvas, step, revealed).map((f) => f.id));
  const more = step.fields.filter((f) => f.more && isFieldShown(canvas, f));
  const firstHidden = more.findIndex((f) => !shown.has(f.id));
  if (firstHidden === -1) return null;
  const next = more[firstHidden]!;
  return { revealed: step.id === 'why' ? Math.max(revealed, firstHidden + 1) : more.length, fieldId: next.id };
}

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

/** Note the join time only. Used when the workspace opens, so a saved canvas is not mistaken for fresh typing. */
export function stampJoined(canvas: Canvas, now: number): Canvas {
  return canvas.meta.joinedAt ? canvas : { ...canvas, meta: { ...canvas.meta, joinedAt: now } };
}

/**
 * Note when the participant joined and when they first typed, once each. Returns
 * the same canvas object when there is nothing to add, so it is cheap to call.
 */
export function stampMeta(canvas: Canvas, now: number): Canvas {
  const joinedAt = canvas.meta.joinedAt || now;
  const firstInputAt = canvas.meta.firstInputAt || (hasAnyInput(canvas) ? now : 0);
  if (joinedAt === canvas.meta.joinedAt && firstInputAt === canvas.meta.firstInputAt) return canvas;
  return { ...canvas, meta: { joinedAt, firstInputAt } };
}
