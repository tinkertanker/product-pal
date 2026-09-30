import { describe, expect, it } from 'vitest';
import { COACH_STEP_IDS, emptyCanvas, setField, stepFingerprint } from './canvas';
import { filledCanvas } from './fixtures';
import {
  ALLOWED_MISS_MIN_CHECKS,
  CHECK_PASS,
  GENUINE_CHECK,
  GENUINE_PASS,
  STEP_CHECKS,
  buildJudgeRequest,
  checksFor,
  interpretJudge,
  parseJevAnswers,
} from './judge';

/** Every check at the given probability, with overrides. */
const answers = (step: (typeof COACH_STEP_IDS)[number], base: number, over: Record<string, number> = {}) => ({
  ...Object.fromEntries(checksFor(step).map((c) => [c.id, base])),
  ...over,
});

describe('the checks', () => {
  it('gives every step the genuine check plus its own', () => {
    for (const step of COACH_STEP_IDS) {
      expect(checksFor(step)[0]).toBe(GENUINE_CHECK);
      expect(STEP_CHECKS[step].length).toBeGreaterThanOrEqual(3);
    }
  });
  it('has the ids the spec names', () => {
    expect(STEP_CHECKS.idea.map((c) => c.id)).toEqual(['specific_user', 'real_pain', 'job_not_tech']);
    expect(STEP_CHECKS.why.map((c) => c.id)).toEqual(['goes_deeper', 'actionable', 'why_without_ai']);
    expect(STEP_CHECKS.problem.map((c) => c.id)).toEqual(['names_user', 'no_solution', 'has_consequence', 'has_cause', 'has_evidence']);
    expect(STEP_CHECKS.metric.map((c) => c.id)).toEqual(['outcome_not_activity', 'has_baseline', 'target_with_time', 'has_guardrail']);
    expect(STEP_CHECKS.assumption.map((c) => c.id)).toEqual(['would_sink_it', 'cheap_test', 'pass_mark']);
    expect(STEP_CHECKS.experience.map((c) => c.id)).toEqual(['existing_tools', 'concrete_steps', 'unhappy_path']);
  });
  it('marks the four required checks', () => {
    const required = COACH_STEP_IDS.flatMap((s) => STEP_CHECKS[s].filter((c) => c.required).map((c) => c.id));
    expect(required.sort()).toEqual(['job_not_tech', 'no_solution', 'outcome_not_activity', 'why_without_ai']);
  });
  it('keeps ids unique within a step and labels free of em dashes', () => {
    for (const step of COACH_STEP_IDS) {
      const ids = checksFor(step).map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const c of checksFor(step)) {
        expect(c.label + c.instructions).not.toContain('—');
        expect(c.label.length).toBeGreaterThan(5);
      }
    }
  });
  it('matches the step 5 wording: a test for the next 30 minutes, no code', () => {
    const cheap = STEP_CHECKS.assumption.find((c) => c.id === 'cheap_test');
    expect(cheap?.instructions).toContain('30 minutes');
    expect(cheap?.instructions).toContain('without writing any code');
    expect(cheap?.label).toContain('30 minutes');
  });
});

describe('buildJudgeRequest', () => {
  it('puts the step fields, title and one noul question per check in the body', () => {
    const { state, questions } = buildJudgeRequest(filledCanvas(), 'problem');
    expect(state.step).toBe('Problem statement');
    expect(state.fields.statement).toContain('New night nurses need to find patient changes');
    expect(Object.keys(state.fields)).toEqual(['clarity', 'consequence', 'cause', 'confirmation', 'statement']);
    expect(Object.keys(questions)).toEqual(checksFor('problem').map((c) => c.id));
    expect(questions.genuine).toMatchObject({ type: 'noul' });
    expect(questions.no_solution?.instructions).toContain('`fields.statement`');
  });
  it('sends the whys as a list without the blanks', () => {
    const { state } = buildJudgeRequest(filledCanvas(), 'why');
    expect(state.fields.whys).toHaveLength(3);
    expect(state.fields.statement).toContain('reliable handover');
  });
  it('summarises only earlier steps, each clamped', () => {
    let c = filledCanvas();
    c = setField(c, 'idea', 'oneLine', 'x'.repeat(1000));
    const { state } = buildJudgeRequest(c, 'metric');
    expect(Object.keys(state.earlier)).toEqual(['idea', 'why', 'problem']);
    expect(state.earlier.idea).toHaveLength(300);
    expect(buildJudgeRequest(c, 'idea').state.earlier).toEqual({});
  });
  it('carries clarifications and tells the judge to count them', () => {
    const plain = buildJudgeRequest(filledCanvas(), 'problem');
    expect(plain.state.clarifications).toEqual([]);
    expect(plain.questions.has_evidence?.instructions).not.toContain('clarifications');
    const withAnswers = buildJudgeRequest(filledCanvas(), 'problem', ['  I timed it: 22 minutes.  ', '   ']);
    expect(withAnswers.state.clarifications).toEqual(['I timed it: 22 minutes.']);
    expect(withAnswers.questions.has_evidence?.instructions).toContain('`clarifications`');
  });
  it('works on an empty canvas', () => {
    for (const step of COACH_STEP_IDS) expect(() => buildJudgeRequest(emptyCanvas(), step)).not.toThrow();
  });
});

describe('interpretJudge', () => {
  const fp = 'abcd1234';
  it('passes when everything is clearly met', () => {
    const j = interpretJudge('problem', answers('problem', 0.9), fp, 1234);
    expect(j).toMatchObject({ step: 'problem', pass: true, fingerprint: fp, at: 1234 });
    expect(j.checks.map((c) => c.id)).toEqual(checksFor('problem').map((c) => c.id));
    expect(j.checks.every((c) => c.pass)).toBe(true);
    expect(j.checks[1]?.label).toBe(STEP_CHECKS.problem[0]?.label);
  });
  it('uses 0.5 for each check and 0.6 for genuine', () => {
    expect(CHECK_PASS).toBe(0.5);
    expect(GENUINE_PASS).toBe(0.6);
    const at = interpretJudge('idea', answers('idea', 0.5, { genuine: 0.6 }), fp, 0);
    expect(at.pass).toBe(true);
    expect(interpretJudge('idea', answers('idea', 0.5, { genuine: 0.59 }), fp, 0).pass).toBe(false);
    expect(interpretJudge('idea', answers('idea', 0.5, { specific_user: 0.49 }), fp, 0).pass).toBe(false);
  });
  it('fails on placeholder text however the other checks fell', () => {
    expect(interpretJudge('problem', answers('problem', 1, { genuine: 0.48 }), fp, 0).pass).toBe(false);
  });
  it('lets steps with four or more other checks miss one, but not two', () => {
    expect(ALLOWED_MISS_MIN_CHECKS).toBe(4);
    expect(interpretJudge('problem', answers('problem', 0.9, { has_evidence: 0.1 }), fp, 0).pass).toBe(true);
    expect(interpretJudge('problem', answers('problem', 0.9, { has_evidence: 0.1, has_cause: 0.1 }), fp, 0).pass).toBe(false);
    expect(interpretJudge('metric', answers('metric', 0.9, { target_with_time: 0.1 }), fp, 0).pass).toBe(true);
    expect(interpretJudge('metric', answers('metric', 0.9, { target_with_time: 0.1, has_baseline: 0.1 }), fp, 0).pass).toBe(false);
  });
  it('needs every check on steps with three other checks', () => {
    for (const step of ['idea', 'why', 'assumption', 'experience'] as const) {
      const first = STEP_CHECKS[step][0]?.id as string;
      expect(interpretJudge(step, answers(step, 0.9), fp, 0).pass).toBe(true);
      expect(interpretJudge(step, answers(step, 0.9, { [first]: 0.1 }), fp, 0).pass).toBe(false);
    }
  });
  it('never lets a required check slip through the allowance', () => {
    expect(interpretJudge('problem', answers('problem', 0.9, { no_solution: 0.1 }), fp, 0).pass).toBe(false);
    expect(interpretJudge('metric', answers('metric', 0.9, { outcome_not_activity: 0.1 }), fp, 0).pass).toBe(false);
    expect(interpretJudge('idea', answers('idea', 0.9, { job_not_tech: 0.1 }), fp, 0).pass).toBe(false);
    expect(interpretJudge('why', answers('why', 0.9, { why_without_ai: 0.1 }), fp, 0).pass).toBe(false);
  });
  it('treats a missing answer as a miss', () => {
    const partial = answers('problem', 0.9);
    delete (partial as Record<string, number>).has_cause;
    const j = interpretJudge('problem', partial, fp, 0);
    expect(j.checks.find((c) => c.id === 'has_cause')).toMatchObject({ probability: 0, pass: false });
    expect(j.pass).toBe(true);
  });
  it('carries the real fingerprint of the judged fields', () => {
    const c = filledCanvas();
    expect(interpretJudge('idea', answers('idea', 0.9), stepFingerprint(c, 'idea'), 0).fingerprint).toBe(stepFingerprint(c, 'idea'));
  });
});

describe('parseJevAnswers', () => {
  it('reads noul probabilities and clamps them', () => {
    expect(parseJevAnswers({ answers: { a: { type: 'noul', noul: 0.25 }, b: { type: 'noul', noul: 1.4 } } })).toEqual({ a: 0.25, b: 1 });
  });
  it('rejects anything that does not look like an answer', () => {
    expect(parseJevAnswers(null)).toBeNull();
    expect(parseJevAnswers({})).toBeNull();
    expect(parseJevAnswers({ answers: {} })).toBeNull();
    expect(parseJevAnswers({ answers: { a: { type: 'noul', noul: 'high' } } })).toBeNull();
  });
});
