import { describe, expect, it } from 'vitest';
import { emptyCanvas, setField, stepFingerprint, type Canvas } from './canvas';
import type { JudgeCheck, Judgement } from './contracts';
import { canCheck, emptyBoxesMessage, failedCheckIds, judgeCard, judgeView, needsAutoCheck, shouldNudge, stepStatus } from './judgeFlow';

const on = { judge: true };
const off = { judge: false };

/** A small canvas with the first screen filled in. */
function whoFilled(): Canvas {
  let c = emptyCanvas();
  c = setField(c, 'who', 'who', 'New nurses on night shift');
  c = setField(c, 'who', 'pain', 'At handover they hunt through three systems to find what changed');
  c = setField(c, 'who', 'evidence', 'I timed four handovers: about 20 minutes each');
  return c;
}

const judged = (canvas: Canvas, pass: boolean, checks: Judgement['checks'] = []): Canvas => ({
  ...canvas,
  judgements: { who: { step: 'who', pass, checks, fingerprint: stepFingerprint(canvas, 'who'), at: 1 } },
});

const check = (id: string, pass: boolean, fix?: string): JudgeCheck => ({ id, label: `label ${id}`, probability: pass ? 0.9 : 0.1, pass, ...(fix ? { fix } : {}) });
const verdict = (pass: boolean, checks: JudgeCheck[]): Judgement => ({ step: 'who', pass, checks, fingerprint: 'f1', at: 1 });

describe('stepStatus', () => {
  it('is todo for an empty step', () => {
    expect(stepStatus(emptyCanvas(), 'who', on)).toBe('todo');
    expect(stepStatus(emptyCanvas(), 'who', off)).toBe('todo');
  });
  it('is done by the length rule when the checker is off', () => {
    expect(stepStatus(whoFilled(), 'who', off)).toBe('done');
  });
  it('shows filled when every box has an answer but nothing has passed', () => {
    expect(stepStatus(whoFilled(), 'who', on)).toBe('filled');
    const short = setField(whoFilled(), 'who', 'evidence', 'saw it');
    expect(stepStatus(short, 'who', off)).toBe('filled');
  });
  it('needs a passing, current judgement when the checker is on', () => {
    expect(stepStatus(judged(whoFilled(), true), 'who', on)).toBe('done');
    expect(stepStatus(judged(whoFilled(), false), 'who', on)).toBe('almost');
  });
  it('shows checking only while a check runs on an unfinished step', () => {
    expect(stepStatus(whoFilled(), 'who', on, true)).toBe('checking');
    expect(stepStatus(whoFilled(), 'who', off, true)).toBe('done');
  });
  it('goes back to filled when the text changes after a judgement', () => {
    const changed = setField(judged(whoFilled(), true), 'who', 'pain', 'Something quite different now');
    expect(stepStatus(changed, 'who', on)).toBe('filled');
  });
  it('treats the brief step by its document', () => {
    expect(stepStatus(emptyCanvas(), 'brief', on)).toBe('todo');
  });
});

describe('canCheck and needsAutoCheck', () => {
  it('waits for every required box to have something', () => {
    expect(canCheck(emptyCanvas(), 'who')).toBe(false);
    expect(canCheck(whoFilled(), 'who')).toBe(true);
  });
  it('lets short but real answers through to the checker', () => {
    let c = emptyCanvas();
    c = setField(c, 'bet', 'assumption', 'Nurses will trust it');
    c = setField(c, 'bet', 'test', 'by papers');
    c = setField(c, 'bet', 'passMark', '1 out of 2');
    expect(canCheck(c, 'bet')).toBe(true);
    c = setField(c, 'bet', 'passMark', '   ');
    expect(canCheck(c, 'bet')).toBe(false);
  });
  it('ignores the parked idea', () => {
    expect(canCheck(whoFilled(), 'who')).toBe(true);
  });
  it('auto-checks only unjudged, filled, non-running steps with the checker on', () => {
    const c = whoFilled();
    expect(needsAutoCheck(c, 'who', on, false)).toBe(true);
    expect(needsAutoCheck(c, 'who', off, false)).toBe(false);
    expect(needsAutoCheck(c, 'who', on, true)).toBe(false);
    expect(needsAutoCheck(emptyCanvas(), 'who', on, false)).toBe(false);
    expect(needsAutoCheck(judged(c, false), 'who', on, false)).toBe(false);
  });
  it('checks again once the text has changed', () => {
    const changed = setField(judged(whoFilled(), true), 'who', 'pain', 'A brand new pain that is long enough');
    expect(needsAutoCheck(changed, 'who', on, false)).toBe(true);
  });
  it('does not re-check when only the parked idea changes', () => {
    const edited = setField(judged(whoFilled(), true), 'who', 'parkedIdea', 'A chatbot, maybe');
    expect(needsAutoCheck(edited, 'who', on, false)).toBe(false);
    expect(stepStatus(edited, 'who', on)).toBe('done');
  });
});

describe('emptyBoxesMessage', () => {
  it('names the empty boxes by their labels', () => {
    expect(emptyBoxesMessage(emptyCanvas(), 'who')).toBe('Three boxes still need an answer: Who is this for?, What\'s hard for them today?, How do you know?');
    const c = setField(setField(emptyCanvas(), 'who', 'who', 'Nurses'), 'who', 'pain', 'Handover is slow');
    expect(emptyBoxesMessage(c, 'who')).toBe('One box still needs an answer: How do you know?');
  });
  it('tells the repeated whys apart', () => {
    expect(emptyBoxesMessage(emptyCanvas(), 'why')).toContain('And why is that? (2)');
  });
  it('is empty once every required box has an answer', () => {
    expect(emptyBoxesMessage(whoFilled(), 'who')).toBe('');
  });
  it('leaves out the conditional box when an idea is parked', () => {
    expect(emptyBoxesMessage(emptyCanvas(), 'brief')).toContain("smallest thing you'd build");
    const parked = setField(emptyCanvas(), 'who', 'parkedIdea', 'A summary page');
    expect(emptyBoxesMessage(parked, 'brief')).not.toContain('smallest');
  });
});

describe('judgeView', () => {
  it('distinguishes none, checking, result and stale', () => {
    const c = whoFilled();
    expect(judgeView(c, 'who', false).kind).toBe('none');
    expect(judgeView(c, 'who', true).kind).toBe('checking');
    expect(judgeView(judged(c, true), 'who', false).kind).toBe('result');
    expect(judgeView(setField(judged(c, true), 'who', 'who', 'somebody else entirely'), 'who', false).kind).toBe('stale');
  });
  it('is not made stale by an edit to the parked idea', () => {
    expect(judgeView(setField(judged(whoFilled(), true), 'who', 'parkedIdea', 'later'), 'who', false).kind).toBe('result');
  });
});

describe('judgeCard', () => {
  it('is a short thank-you on a clean pass', () => {
    expect(judgeCard(verdict(true, [check('a', true), check('b', true)]))).toEqual({ tone: 'pass', headline: 'Done. Nice work.', lines: [] });
  });
  it('shows the fix line for a miss on a pass', () => {
    expect(judgeCard(verdict(true, [check('a', true), check('b', false, 'Give a rough number.')]))).toEqual({
      tone: 'miss',
      headline: 'Done. One thing worth a look:',
      lines: ['Give a rough number.'],
    });
  });
  it('lists every fix on a fail, falling back to the label', () => {
    const card = judgeCard(verdict(false, [check('a', false, 'Name one person.'), check('b', false), check('c', true)]));
    expect(card.tone).toBe('fail');
    expect(card.headline).toBe('Nearly there. Fix these, then check again:');
    expect(card.lines).toEqual(['Name one person.', 'label b']);
  });
  it('has no em dash', () => {
    const lines = [
      judgeCard(verdict(true, [check('a', true)])).headline,
      judgeCard(verdict(true, [check('a', false), check('b', false)])).headline,
      judgeCard(verdict(false, [check('a', false)])).headline,
    ];
    for (const line of lines) expect(line).not.toContain('—');
  });
});

describe('nudges', () => {
  const j = verdict(false, [check('a', false), check('b', true), check('c', false)]);
  it('sends the ids of the missed checks', () => {
    expect(failedCheckIds(j)).toEqual(['a', 'c']);
  });
  it('sends at most six', () => {
    const many = verdict(false, Array.from({ length: 8 }, (_, i) => check(`c${i}`, false)));
    expect(failedCheckIds(many)).toHaveLength(6);
  });
  it('asks once per judgement', () => {
    expect(shouldNudge(j, undefined)).toBe(true);
    expect(shouldNudge(j, 'f0')).toBe(true);
    expect(shouldNudge(j, 'f1')).toBe(false);
  });
  it('does not ask when nothing was missed', () => {
    expect(shouldNudge(verdict(true, [check('a', true)]), undefined)).toBe(false);
  });
});
