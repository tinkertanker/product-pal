// The step checker: which yes/no questions Jev (TypeSafe) is asked about each
// step, how the answers turn into a pass or fail, and what the request looks
// like. Pure: the Worker does the fetch.

import { COACH_STEP_IDS, getField, judgedFields, type Canvas, type CoachStepId, type StepId } from './canvas';
import type { JudgeCheck, Judgement } from './contracts';
import { getStep } from './steps';

export type JudgeCheckDef = {
  id: string;
  /** What participants see next to the tick or cross. Warm, short, positive. */
  label: string;
  /** One short line shown when the check is missed: what to do about it. */
  fix: string;
  /** The yes/no question for Jev. Backtick paths point into `state`. */
  instructions: string;
  /** Must pass whatever else happens (the one-miss allowance does not cover it). */
  required: boolean;
  /** Probability needed to pass, when this check needs a different bar from CHECK_PASS. */
  passAt?: number;
};

// ---------------------------------------------------------------------------
// Thresholds. Calibrated against real Jev calls; see judge.test.ts for the rule.
// ---------------------------------------------------------------------------

/** A check passes at this probability or above. */
export const CHECK_PASS = 0.5;
/** The `genuine` check has to clear a higher bar, so placeholder text cannot slip through. */
export const GENUINE_PASS = 0.6;
/**
 * The why chain is required, and its question is strict (each answer must follow
 * from the one before and add a new cause). Jev's scores for that question run
 * lower than for the others: sound chains scored 0.40 to 0.48, while chains that
 * restate themselves or jump sideways scored 0.06 to 0.19. 0.3 sits in the gap.
 */
export const GOES_DEEPER_PASS = 0.3;
/** Steps with at least this many checks (besides `genuine`) may miss one of the non-required ones. */
export const ALLOWED_MISS_MIN_CHECKS = 4;

export const GENUINE_CHECK: JudgeCheckDef = {
  id: 'genuine',
  label: 'Reads as a real attempt',
  fix: 'Write a real attempt, even a rough one.',
  instructions:
    "Is `fields` a genuine attempt at this step, rather than placeholder or joke text such as 'idk', 'test', 'asdf' or 'whatever'?",
  required: true,
  passAt: GENUINE_PASS,
};

const check = (id: string, label: string, fix: string, instructions: string, required = false, passAt?: number): JudgeCheckDef => ({
  id,
  label,
  fix,
  instructions,
  required,
  ...(passAt === undefined ? {} : { passAt }),
});

/** The checks for each step, without `genuine` (which every step gets). */
export const STEP_CHECKS: Record<CoachStepId, JudgeCheckDef[]> = {
  who: [
    check(
      'specific_user',
      'Names one person or role',
      'Name one person or role, such as "night-shift nurses".',
      'Does `fields.who` name one specific person or role (for example "new nurses on night shift"), rather than a vague group such as "everyone", "users" or "the business"?',
      true,
    ),
    check(
      'real_pain',
      'Describes a moment that is hard today',
      'Describe one moment where it goes wrong for them today.',
      'Does `fields.pain` describe a concrete moment or situation that is hard for this person today, rather than a general wish or a missing feature?',
    ),
    check(
      'problem_not_solution',
      'Describes the difficulty without naming a fix',
      'Describe what is hard. Move any app, AI or feature to the parked idea box.',
      'Do `fields.who` and `fields.pain` describe the difficulty without proposing a solution or naming a technology such as an app, AI, a chatbot, a dashboard or a feature? Answer yes only if they describe the problem alone.',
      true,
    ),
    check(
      'honest_evidence',
      'Says how you know, or how you\'d find out',
      'Add something you saw, heard or counted, or say how you\'d check.',
      'Does `fields.evidence` either give something the participant saw, heard or counted, or honestly say that they have not checked yet and how they would find out (for example "I haven\'t checked yet; I\'d ask three nurses")? Answer no for filler such as "NA" or "idk", and for a bare claim with no source or way to check it.',
    ),
  ],
  why: [
    check(
      'goes_deeper',
      'Each why digs into a cause',
      'Make each answer explain the one before it, not restate it.',
      'The first answer in `fields.whys` gives a reason for the difficulty in `earlier.who`, and each later answer gives a reason for the one before it. Short answers are fine. Does every answer follow from the one before it and add a new, deeper cause? Answer no if any answer repeats or rewords the one before it, or does not follow from it.',
      true,
      GOES_DEEPER_PASS,
    ),
    check(
      'actionable',
      'Ends at something a team could change',
      'Keep going until you reach something your team could change.',
      'Does the chain of answers in `fields.whys` end at a cause that a person or team could realistically do something about?',
    ),
    check(
      'has_consequence',
      'Says what happens if nothing changes',
      'Say what it costs them if nothing changes.',
      'Does `fields.consequence` say what actually happens, or what it costs the person, if nobody fixes the problem?',
    ),
    check(
      'statement_no_solution',
      'The problem statement stops before any solution',
      'Take the app, tool or AI out of the problem statement.',
      'Is `fields.statement` free of any proposed solution or technology (such as an app, a tool, a chatbot or AI)? Answer yes only if it describes the problem alone.',
      true,
    ),
  ],
  success: [
    check(
      'outcome_not_activity',
      'Measures a change in their day',
      'Pick a change in their day, such as minutes saved. Logins and usage don\'t count.',
      "Does `fields.metric` measure a change in the user's day or outcome (such as time taken, errors made or results achieved), rather than usage such as logins, prompts sent, reports generated or page views?",
      true,
    ),
    check(
      'has_baseline',
      'Gives today\'s value or how to find it',
      'Give a rough number for today, or say how you\'d find it.',
      'Does `fields.today` give a rough current value for the metric, or say how the participant would find it out?',
    ),
  ],
  bet: [
    check(
      'would_sink_it',
      'The assumption would sink the idea if wrong',
      'Pick the belief that, if wrong, means nobody uses this.',
      'Is `fields.assumption` a basic belief that would sink the whole idea if it turned out to be false (for example that people want this, trust it or would change what they do), rather than a detail of design, wording or looks?',
    ),
    check(
      'cheap_test',
      'The test fits in 30 minutes without code',
      'Choose a test you could run in the room in 30 minutes, without code.',
      'Could the test in `fields.test` be run in the next 30 minutes without writing any code, for example by asking a few people, trying it by hand or sketching it on paper?',
    ),
    check(
      'pass_mark',
      'The pass mark is a number decided up front',
      'Give a number that counts as a pass, such as "2 of 3".',
      'Is `fields.passMark` a specific, measurable result that was decided before the test?',
    ),
  ],
  brief: [
    check(
      'concrete_steps',
      'Walks through what the user does and sees',
      'List what the user does and sees, one step at a time.',
      "Does `fields.firstTwoMinutes` walk through the first two minutes step by step from the user's side, with concrete actions and what they see?",
    ),
    check(
      'unhappy_path',
      'Says what the user sees when it goes wrong',
      'Say what the user sees, and what they do next.',
      'Does `fields.unhappyPath` say what the user sees when something goes wrong? Naming what they do next is welcome but not needed. Answer no if it is empty, says nothing goes wrong, or only promises that errors will be handled.',
    ),
  ],
};

/** Every check Jev is asked for a step, `genuine` first. */
export function checksFor(step: CoachStepId): JudgeCheckDef[] {
  return [GENUINE_CHECK, ...STEP_CHECKS[step]];
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

const EARLIER_CHARS = 300;
const CLARIFICATIONS_NOTE =
  " The participant's own extra answers are in `clarifications`. Anything relevant there counts as part of what they wrote, even if the field itself is thin.";

export type JudgeState = {
  step: string;
  fields: Record<string, string | string[]>;
  earlier: Record<string, string>;
  clarifications: string[];
};

/** JSON body for Jev's `noul` questions, keyed by check id. */
export type JudgeQuestions = Record<string, { type: 'noul'; instructions: string }>;

export type JudgeRequestBody = { state: JudgeState; questions: JudgeQuestions };

/**
 * The step's fields as the judge sees them: the boxes that are shown and
 * judged (never the parked idea). The whys go in as one list, blanks dropped.
 */
function fieldsFor(canvas: Canvas, step: CoachStepId): Record<string, string | string[]> {
  const fields: Record<string, string | string[]> = {};
  for (const f of judgedFields(canvas, step)) {
    if (f.id.startsWith('whys.')) continue;
    fields[f.id] = getField(canvas, step, f.id).trim();
  }
  if (step === 'why') {
    // Put the list first so the order reads whys, consequence, statement.
    const whys = canvas.why.whys.map((w) => w.trim()).filter((w) => w.length > 0);
    return { whys, ...fields };
  }
  return fields;
}

/** The main answer of each step, as one line the judge can read as "the story so far". */
function mainAnswer(canvas: Canvas, id: StepId): string {
  const text = (field: string) => getField(canvas, id, field).trim().replace(/\s+/g, ' ');
  switch (id) {
    case 'who': {
      const who = text('who');
      const pain = text('pain');
      return who && pain ? `${who}. ${pain}` : who || pain;
    }
    case 'why':
      return text('statement');
    case 'success':
      return text('metric');
    case 'bet':
      return text('assumption');
    default:
      return '';
  }
}

/** A line or two from each earlier step's main answer, so the judge knows the story so far. */
function earlierFor(canvas: Canvas, step: CoachStepId): Record<string, string> {
  const earlier: Record<string, string> = {};
  for (const id of COACH_STEP_IDS) {
    if (id === step) break;
    const text = mainAnswer(canvas, id);
    if (text) earlier[id] = text.slice(0, EARLIER_CHARS);
  }
  return earlier;
}

export function buildJudgeRequest(canvas: Canvas, step: CoachStepId, clarifications: readonly string[] = []): JudgeRequestBody {
  const answers = clarifications.map((c) => c.trim()).filter((c) => c.length > 0);
  const state: JudgeState = {
    step: getStep(step).title,
    fields: fieldsFor(canvas, step),
    earlier: earlierFor(canvas, step),
    clarifications: answers,
  };
  const questions: JudgeQuestions = {};
  for (const c of checksFor(step)) {
    questions[c.id] = {
      type: 'noul',
      instructions: answers.length > 0 ? c.instructions + CLARIFICATIONS_NOTE : c.instructions,
    };
  }
  return { state, questions };
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

/** The probabilities from a Jev response, by check id. Null if the response does not look right. */
export function parseJevAnswers(data: unknown): Record<string, number> | null {
  if (typeof data !== 'object' || data === null) return null;
  const answers = (data as { answers?: unknown }).answers;
  if (typeof answers !== 'object' || answers === null) return null;
  const out: Record<string, number> = {};
  for (const [id, answer] of Object.entries(answers)) {
    const value = (answer as { noul?: unknown } | null)?.noul;
    if (typeof value === 'number' && Number.isFinite(value)) out[id] = Math.min(1, Math.max(0, value));
  }
  return Object.keys(out).length > 0 ? out : null;
}

function threshold(def: JudgeCheckDef): number {
  return def.passAt ?? CHECK_PASS;
}

/**
 * The pass rule. `genuine` and every required check must pass. The remaining
 * checks must all pass too, except that a step with four or more checks
 * (besides `genuine`) may miss one of them.
 */
export function interpretJudge(
  step: CoachStepId,
  answers: Record<string, number>,
  stepFingerprint: string,
  now: number,
): Judgement {
  const defs = checksFor(step);
  const checks: JudgeCheck[] = defs.map((def) => {
    const probability = answers[def.id] ?? 0;
    return { id: def.id, label: def.label, probability, pass: probability >= threshold(def), fix: def.fix };
  });

  const others = defs.filter((d) => d.id !== GENUINE_CHECK.id);
  const passed = new Map(checks.map((c) => [c.id, c.pass]));
  const requiredOk = defs.filter((d) => d.required).every((d) => passed.get(d.id) === true);
  const misses = others.filter((d) => !d.required && passed.get(d.id) !== true).length;
  const allowedMisses = others.length >= ALLOWED_MISS_MIN_CHECKS ? 1 : 0;

  return { step, pass: requiredOk && misses <= allowedMisses, checks, fingerprint: stepFingerprint, at: now };
}
