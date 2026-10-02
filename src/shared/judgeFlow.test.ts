import { describe, expect, it } from 'vitest';
import { emptyCanvas, setField, stepFingerprint, type Canvas } from './canvas';
import type { Judgement } from './contracts';
import { filledCanvas } from './fixtures';
import { canCheck, judgeHeadline, judgeView, needsAutoCheck, stepStatus } from './judgeFlow';

const on = { judge: true };
const off = { judge: false };

const judged = (canvas: Canvas, pass: boolean, checks: Judgement['checks'] = []): Canvas => ({
  ...canvas,
  judgements: { idea: { step: 'idea', pass, checks, fingerprint: stepFingerprint(canvas, 'idea'), at: 1 } },
});

describe('stepStatus', () => {
  it('is todo for an empty step and done by the length rule when the checker is off', () => {
    expect(stepStatus(emptyCanvas(), 'idea', on)).toBe('todo');
    expect(stepStatus(filledCanvas(), 'idea', off)).toBe('done');
  });
  it('needs a passing, current judgement when the checker is on', () => {
    expect(stepStatus(filledCanvas(), 'idea', on)).toBe('todo');
    expect(stepStatus(judged(filledCanvas(), true), 'idea', on)).toBe('done');
    expect(stepStatus(judged(filledCanvas(), false), 'idea', on)).toBe('almost');
  });
  it('shows checking only while a check runs on an unfinished step', () => {
    expect(stepStatus(filledCanvas(), 'idea', on, true)).toBe('checking');
    expect(stepStatus(filledCanvas(), 'idea', off, true)).toBe('done');
  });
  it('goes back to todo when the text changes after a judgement', () => {
    const changed = setField(judged(filledCanvas(), true), 'idea', 'oneLine', 'Something quite different now');
    expect(stepStatus(changed, 'idea', on)).toBe('todo');
  });
  it('never uses the checker for the build step', () => {
    expect(stepStatus(emptyCanvas(), 'build', on)).toBe('todo');
  });
});

describe('canCheck and needsAutoCheck', () => {
  it('waits for the length rule', () => {
    expect(canCheck(emptyCanvas(), 'idea')).toBe(false);
    expect(canCheck(filledCanvas(), 'idea')).toBe(true);
    expect(canCheck(filledCanvas(), 'build')).toBe(false);
  });

  it('lets short but real answers through to the checker', () => {
    const c = filledCanvas();
    c.assumption.test = 'by papers';
    c.assumption.threshold = '1 out of 2';
    expect(canCheck(c, 'assumption')).toBe(true);
    c.assumption.threshold = '   ';
    expect(canCheck(c, 'assumption')).toBe(false);
  });
  it('auto-checks only unjudged, filled, non-running steps with the checker on', () => {
    const c = filledCanvas();
    expect(needsAutoCheck(c, 'idea', on, false)).toBe(true);
    expect(needsAutoCheck(c, 'idea', off, false)).toBe(false);
    expect(needsAutoCheck(c, 'idea', on, true)).toBe(false);
    expect(needsAutoCheck(emptyCanvas(), 'idea', on, false)).toBe(false);
    expect(needsAutoCheck(judged(c, false), 'idea', on, false)).toBe(false);
    expect(needsAutoCheck(c, 'build', on, false)).toBe(false);
  });
  it('checks again once the text has changed', () => {
    const changed = setField(judged(filledCanvas(), true), 'idea', 'pain', 'A brand new pain that is long enough');
    expect(needsAutoCheck(changed, 'idea', on, false)).toBe(true);
  });
});

describe('judgeView', () => {
  it('distinguishes none, checking, result and stale', () => {
    const c = filledCanvas();
    expect(judgeView(c, 'idea', false).kind).toBe('none');
    expect(judgeView(c, 'idea', true).kind).toBe('checking');
    expect(judgeView(judged(c, true), 'idea', false).kind).toBe('result');
    expect(judgeView(setField(judged(c, true), 'idea', 'who', 'somebody else entirely'), 'idea', false).kind).toBe('stale');
  });
});

describe('judgeHeadline', () => {
  const check = (pass: boolean) => ({ id: 'x', label: 'x', probability: pass ? 0.9 : 0.1, pass });
  const j = (pass: boolean, checks: Judgement['checks']): Judgement => ({ step: 'idea', pass, checks, fingerprint: 'f', at: 1 });
  it('is warm and has no em dash', () => {
    const lines = [judgeHeadline(j(true, [check(true)])), judgeHeadline(j(true, [check(true), check(false)])), judgeHeadline(j(false, [check(false)]))];
    expect(lines[0]).toBe('Nice work. This step is done.');
    expect(lines[1]).toContain('worth a look');
    expect(lines[2]).toBe('Almost there. Have a look at the unticked items, then check again.');
    for (const line of lines) expect(line).not.toContain('—');
  });
});
