import { describe, expect, it } from 'vitest';
import { COACH_STEP_IDS, emptyCanvas, setField, stepFingerprint } from './canvas';
import { filledCanvas, unparkedCanvas } from './fixtures';
import {
  ALLOWED_MISS_MIN_CHECKS,
  CHECK_PASS,
  GENUINE_CHECK,
  GENUINE_PASS,
  GOES_DEEPER_PASS,
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
      expect(STEP_CHECKS[step].length).toBeGreaterThanOrEqual(2);
    }
  });
  it('has the ids the spec names', () => {
    expect(STEP_CHECKS.who.map((c) => c.id)).toEqual(['specific_user', 'real_pain', 'problem_not_solution', 'honest_evidence']);
    expect(STEP_CHECKS.why.map((c) => c.id)).toEqual(['goes_deeper', 'actionable', 'has_consequence', 'statement_no_solution']);
    expect(STEP_CHECKS.success.map((c) => c.id)).toEqual(['outcome_not_activity', 'has_baseline']);
    expect(STEP_CHECKS.bet.map((c) => c.id)).toEqual(['would_sink_it', 'cheap_test', 'pass_mark']);
    expect(STEP_CHECKS.brief.map((c) => c.id)).toEqual(['concrete_steps', 'unhappy_path']);
  });
  it('marks the required checks', () => {
    const required = COACH_STEP_IDS.flatMap((s) => STEP_CHECKS[s].filter((c) => c.required).map((c) => c.id));
    expect(required.sort()).toEqual(['goes_deeper', 'outcome_not_activity', 'problem_not_solution', 'specific_user', 'statement_no_solution']);
  });
  it('gives every check a fix line and a label, with no em dashes', () => {
    for (const step of COACH_STEP_IDS) {
      const ids = checksFor(step).map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const c of checksFor(step)) {
        expect(c.fix.length).toBeGreaterThan(10);
        expect(c.label.length).toBeGreaterThan(5);
        expect(c.label + c.fix + c.instructions).not.toContain('—');
      }
    }
  });
  it('words the participant-facing lines as the spec does', () => {
    const find = (step: (typeof COACH_STEP_IDS)[number], id: string) => checksFor(step).find((c) => c.id === id);
    expect(find('who', 'specific_user')).toMatchObject({ label: 'Names one person or role', fix: 'Name one person or role, such as "night-shift nurses".' });
    expect(find('why', 'goes_deeper')?.fix).toBe('Make each answer explain the one before it, not restate it.');
    expect(find('bet', 'cheap_test')?.label).toBe('The test fits in 30 minutes without code');
    expect(find('brief', 'unhappy_path')?.fix).toBe('Say what the user sees, and what they do next.');
  });
  it('keeps the 30-minute, no-code test question', () => {
    const cheap = STEP_CHECKS.bet.find((c) => c.id === 'cheap_test');
    expect(cheap?.instructions).toContain('30 minutes');
    expect(cheap?.instructions).toContain('without writing any code');
  });
});

describe('buildJudgeRequest', () => {
  it('puts the step fields, title and one noul question per check in the body', () => {
    const { state, questions } = buildJudgeRequest(filledCanvas(), 'why');
    expect(state.step).toBe('Why');
    expect(Object.keys(state.fields)).toEqual(['whys', 'consequence', 'statement']);
    expect(state.fields.statement).toContain('nobody owns a single summary');
    expect(Object.keys(questions)).toEqual(checksFor('why').map((c) => c.id));
    expect(questions.genuine).toMatchObject({ type: 'noul' });
    expect(questions.statement_no_solution?.instructions).toContain('`fields.statement`');
  });
  it('sends the whys as a list without the blanks', () => {
    const { state } = buildJudgeRequest(filledCanvas(), 'why');
    expect(state.fields.whys).toHaveLength(3);
  });
  it('never sends the parked idea', () => {
    const { state } = buildJudgeRequest(filledCanvas(), 'who');
    expect(Object.keys(state.fields)).toEqual(['who', 'pain', 'evidence']);
    expect(JSON.stringify(buildJudgeRequest(filledCanvas(), 'brief'))).not.toContain('A summary of what changed since the last shift');
  });
  it('sends the smallest-build box only when it is shown', () => {
    expect(Object.keys(buildJudgeRequest(filledCanvas(), 'brief').state.fields)).toEqual(['firstTwoMinutes', 'unhappyPath', 'where']);
    expect(Object.keys(buildJudgeRequest(unparkedCanvas(), 'brief').state.fields)).toEqual(['firstTwoMinutes', 'unhappyPath', 'smallestBuild', 'where']);
  });
  it('summarises only earlier steps, each clamped', () => {
    let c = filledCanvas();
    c = setField(c, 'who', 'pain', 'x'.repeat(1000));
    const { state } = buildJudgeRequest(c, 'success');
    expect(Object.keys(state.earlier)).toEqual(['who', 'why']);
    expect(state.earlier.who).toHaveLength(300);
    expect(state.earlier.why).toContain('New night nurses cannot see');
    expect(buildJudgeRequest(c, 'who').state.earlier).toEqual({});
    expect(Object.keys(buildJudgeRequest(c, 'brief').state.earlier)).toEqual(['who', 'why', 'success', 'bet']);
  });
  it('carries clarifications and tells the judge to count them', () => {
    const plain = buildJudgeRequest(filledCanvas(), 'who');
    expect(plain.state.clarifications).toEqual([]);
    expect(plain.questions.honest_evidence?.instructions).not.toContain('clarifications');
    const withAnswers = buildJudgeRequest(filledCanvas(), 'who', ['  I timed it: 22 minutes.  ', '   ']);
    expect(withAnswers.state.clarifications).toEqual(['I timed it: 22 minutes.']);
    expect(withAnswers.questions.honest_evidence?.instructions).toContain('`clarifications`');
  });
  it('works on an empty canvas', () => {
    for (const step of COACH_STEP_IDS) expect(() => buildJudgeRequest(emptyCanvas(), step)).not.toThrow();
  });
});

describe('interpretJudge', () => {
  const fp = 'abcd1234';
  it('passes when everything is clearly met, and returns a fix line on every check', () => {
    const j = interpretJudge('why', answers('why', 0.9), fp, 1234);
    expect(j).toMatchObject({ step: 'why', pass: true, fingerprint: fp, at: 1234 });
    expect(j.checks.map((c) => c.id)).toEqual(checksFor('why').map((c) => c.id));
    expect(j.checks.every((c) => c.pass)).toBe(true);
    expect(j.checks[1]?.label).toBe(STEP_CHECKS.why[0]?.label);
    expect(j.checks[1]?.fix).toBe(STEP_CHECKS.why[0]?.fix);
    expect(j.checks.every((c) => typeof c.fix === 'string' && c.fix.length > 0)).toBe(true);
  });
  it('uses 0.5 for each check and 0.6 for genuine', () => {
    expect(CHECK_PASS).toBe(0.5);
    expect(GENUINE_PASS).toBe(0.6);
    const at = interpretJudge('bet', answers('bet', 0.5, { genuine: 0.6 }), fp, 0);
    expect(at.pass).toBe(true);
    expect(interpretJudge('bet', answers('bet', 0.5, { genuine: 0.59 }), fp, 0).pass).toBe(false);
    expect(interpretJudge('bet', answers('bet', 0.5, { cheap_test: 0.49 }), fp, 0).pass).toBe(false);
  });
  it('holds the why chain to its own calibrated bar, below the default because Jev scores that question low', () => {
    expect(GOES_DEEPER_PASS).toBe(0.3);
    expect(interpretJudge('why', answers('why', 0.9, { goes_deeper: 0.3 }), fp, 0).pass).toBe(true);
    expect(interpretJudge('why', answers('why', 0.9, { goes_deeper: 0.29 }), fp, 0).pass).toBe(false);
    // Required: the one-miss allowance does not cover it.
    expect(interpretJudge('why', answers('why', 0.9, { goes_deeper: 0.1 }), fp, 0).checks[1]).toMatchObject({ id: 'goes_deeper', pass: false });
  });
  it('fails on placeholder text however the other checks fell', () => {
    expect(interpretJudge('who', answers('who', 1, { genuine: 0.48 }), fp, 0).pass).toBe(false);
  });
  it('lets steps with four checks miss one non-required check, but not two', () => {
    expect(ALLOWED_MISS_MIN_CHECKS).toBe(4);
    expect(interpretJudge('who', answers('who', 0.9, { honest_evidence: 0.1 }), fp, 0).pass).toBe(true);
    expect(interpretJudge('who', answers('who', 0.9, { honest_evidence: 0.1, real_pain: 0.1 }), fp, 0).pass).toBe(false);
    expect(interpretJudge('why', answers('why', 0.9, { actionable: 0.1 }), fp, 0).pass).toBe(true);
    expect(interpretJudge('why', answers('why', 0.9, { actionable: 0.1, has_consequence: 0.1 }), fp, 0).pass).toBe(false);
  });
  it('needs every check on steps with fewer than four', () => {
    for (const step of ['success', 'bet', 'brief'] as const) {
      const first = STEP_CHECKS[step].find((c) => !c.required)?.id ?? (STEP_CHECKS[step][0]?.id as string);
      expect(interpretJudge(step, answers(step, 0.9), fp, 0).pass).toBe(true);
      expect(interpretJudge(step, answers(step, 0.9, { [first]: 0.1 }), fp, 0).pass).toBe(false);
    }
  });
  it('never lets a required check slip through the allowance', () => {
    for (const [step, id] of [
      ['who', 'specific_user'],
      ['who', 'problem_not_solution'],
      ['why', 'goes_deeper'],
      ['why', 'statement_no_solution'],
      ['success', 'outcome_not_activity'],
    ] as const) {
      expect(interpretJudge(step, answers(step, 0.9, { [id]: 0.05 }), fp, 0).pass).toBe(false);
    }
  });
  it('treats a missing answer as a miss', () => {
    const partial = answers('who', 0.9);
    delete (partial as Record<string, number>).honest_evidence;
    const j = interpretJudge('who', partial, fp, 0);
    expect(j.checks.find((c) => c.id === 'honest_evidence')).toMatchObject({ probability: 0, pass: false });
    expect(j.pass).toBe(true);
  });
  it('carries the real fingerprint of the judged fields', () => {
    const c = filledCanvas();
    expect(interpretJudge('who', answers('who', 0.9), stepFingerprint(c, 'who'), 0).fingerprint).toBe(stepFingerprint(c, 'who'));
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
