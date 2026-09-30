// The step checker: which yes/no questions Jev (TypeSafe) is asked about each
// step, how the answers turn into a pass or fail, and what the request looks
// like. Pure: the Worker does the fetch.

import { COACH_STEP_IDS, getField, type Canvas, type CoachStepId } from './canvas';
import type { JudgeCheck, Judgement } from './contracts';
import { getMainField, getStep } from './steps';

export type JudgeCheckDef = {
  id: string;
  /** What participants see next to the tick or cross. Warm, short, positive. */
  label: string;
  /** The yes/no question for Jev. Backtick paths point into `state`. */
  instructions: string;
  /** Must pass whatever else happens (the one-miss allowance does not cover it). */
  required: boolean;
};

// ---------------------------------------------------------------------------
// Thresholds. Calibrated against real Jev calls; see judge.test.ts for the rule.
// ---------------------------------------------------------------------------

/** A check passes at this probability or above. */
export const CHECK_PASS = 0.5;
/** The `genuine` check has to clear a higher bar, so placeholder text cannot slip through. */
export const GENUINE_PASS = 0.6;
/** Steps with more than this many checks (besides `genuine`) may miss one of the non-required ones. */
export const ALLOWED_MISS_MIN_CHECKS = 4;

export const GENUINE_CHECK: JudgeCheckDef = {
  id: 'genuine',
  label: 'Reads as a real attempt',
  instructions:
    "Is `fields` a genuine attempt at this step, rather than placeholder or joke text such as 'idk', 'test', 'asdf' or 'whatever'?",
  required: true,
};

const check = (id: string, label: string, instructions: string, required = false): JudgeCheckDef => ({
  id,
  label,
  instructions,
  required,
});

/** The checks for each step, without `genuine` (which every step gets). */
export const STEP_CHECKS: Record<CoachStepId, JudgeCheckDef[]> = {
  idea: [
    check(
      'specific_user',
      'Names a specific person or role',
      'Does `fields.who` name a specific person or role (for example "new nurses on night shift"), rather than a vague group such as "everyone", "users" or "the business"?',
    ),
    check(
      'real_pain',
      'Describes a real difficulty they have today',
      'Does `fields.pain` describe a concrete difficulty that this person faces today, rather than a general wish or a missing feature?',
    ),
    check(
      'job_not_tech',
      'Says what the idea does without naming a technology',
      'Does `fields.oneLine` describe the job to be done without naming a technology such as AI, an app, a chatbot, an agent or a dashboard?',
      true,
    ),
  ],
  why: [
    check(
      'goes_deeper',
      'Each why goes deeper than the one before',
      'Taken together, do the answers in `fields.whys` dig steadily deeper towards a root cause, rather than going round in circles or sideways?',
    ),
    check(
      'actionable',
      'Reaches a cause someone could act on',
      'Does the chain of answers in `fields.whys` end at a cause that a person or team could realistically do something about?',
    ),
    check(
      'why_without_ai',
      'Still makes sense with the word AI removed',
      'If the word "AI" (and words like chatbot or agent) were removed from `fields.statement`, would the sentence still make sense as a reason to act?',
      true,
    ),
  ],
  problem: [
    check(
      'names_user',
      'Names who is affected',
      'Does the problem statement in `fields.statement` (with `fields.clarity`) name who is affected?',
    ),
    check(
      'no_solution',
      'Leaves out any solution or technology',
      'Is `fields.statement` free of any proposed solution or technology (such as an app, a tool, a chatbot or AI)? Answer yes only if it describes the problem alone.',
      true,
    ),
    check(
      'has_consequence',
      'Says what happens if nothing changes',
      'Does `fields.consequence` say what actually happens if nobody fixes the problem?',
    ),
    check(
      'has_cause',
      'Explains why the problem exists',
      'Does `fields.cause` explain why the problem exists?',
    ),
    check(
      'has_evidence',
      'Gives real evidence that the problem is real',
      'Does `fields.confirmation` give real evidence that the problem exists, such as a number, something the participant observed or a quote from someone affected?',
    ),
  ],
  metric: [
    check(
      'outcome_not_activity',
      "Measures a change in the user's outcome",
      "Does `fields.primary` measure a change in the user's outcome (such as time taken, errors made or results achieved), rather than usage such as logins, prompts sent, reports generated or page views?",
      true,
    ),
    check(
      'has_baseline',
      'Says what the number is today',
      'Does `fields.baseline` give a current value for the metric, or say how the participant would find it out?',
    ),
    check(
      'target_with_time',
      'Sets a target with a timeframe',
      'Does `fields.target` give a target for the metric together with a timeframe?',
    ),
    check(
      'has_guardrail',
      'Names something that must not get worse',
      'Does `fields.guardrail` name something specific that must not get worse while the metric improves?',
    ),
  ],
  assumption: [
    check(
      'would_sink_it',
      'Picks an assumption that would sink the idea if wrong',
      'Is `fields.riskiest` an assumption that would sink the whole idea if it turned out to be false (for example that people want this at all), rather than a minor detail?',
    ),
    check(
      'cheap_test',
      'Has a test you could run in the next 30 minutes without code',
      'Could the test in `fields.test` be run in the next 30 minutes without writing any code, for example by asking a few people, trying it by hand or sketching it on paper?',
    ),
    check(
      'pass_mark',
      'Sets a clear pass mark up front',
      'Is `fields.threshold` a specific, measurable result that was decided before the test?',
    ),
  ],
  experience: [
    check(
      'existing_tools',
      'Fits into tools the user already uses',
      'Does `fields.where` place this inside tools or places the user already uses, rather than asking them to visit something new?',
    ),
    check(
      'concrete_steps',
      'Tells the first two minutes step by step',
      "Does `fields.firstTwoMinutes` tell the first two minutes step by step from the user's side, with concrete actions and what they see?",
    ),
    check(
      'unhappy_path',
      'Says what happens when something goes wrong',
      'Does `fields.unhappyPath` say what the user sees and does when something goes wrong?',
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

/** The step's fields as the judge sees them. The five whys go in as one list (blanks dropped). */
function fieldsFor(canvas: Canvas, step: CoachStepId): Record<string, string | string[]> {
  const fields: Record<string, string | string[]> = {};
  if (step === 'why') {
    fields.whys = canvas.why.whys.map((w) => w.trim()).filter((w) => w.length > 0);
    fields.statement = canvas.why.statement.trim();
    return fields;
  }
  for (const f of getStep(step).fields) fields[f.id] = getField(canvas, step, f.id).trim();
  return fields;
}

/** A line or two from each earlier step's main field, so the judge knows the story so far. */
function earlierFor(canvas: Canvas, step: CoachStepId): Record<string, string> {
  const earlier: Record<string, string> = {};
  for (const id of COACH_STEP_IDS) {
    if (id === step) break;
    const main = getMainField(id);
    const text = main ? getField(canvas, id, main.id).trim().replace(/\s+/g, ' ') : '';
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
  return def.id === GENUINE_CHECK.id ? GENUINE_PASS : CHECK_PASS;
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
    return { id: def.id, label: def.label, probability, pass: probability >= threshold(def) };
  });

  const others = defs.filter((d) => d.id !== GENUINE_CHECK.id);
  const passed = new Map(checks.map((c) => [c.id, c.pass]));
  const requiredOk = defs.filter((d) => d.required).every((d) => passed.get(d.id) === true);
  const misses = others.filter((d) => !d.required && passed.get(d.id) !== true).length;
  const allowedMisses = others.length >= ALLOWED_MISS_MIN_CHECKS ? 1 : 0;

  return { step, pass: requiredOk && misses <= allowedMisses, checks, fingerprint: stepFingerprint, at: now };
}
