import { describe, expect, it } from 'vitest';
import { emptyCanvas, setField } from './canvas';
import { getStep } from './steps';
import { isQuestionsOpener, questionsOpener, revealNext, stampJoined, stampMeta, statementMissing, statementMissingMessage, visibleFields, wordCount } from './briefFlow';

const ids = (fields: { id: string }[]) => fields.map((f) => f.id);

describe('wordCount', () => {
  it('counts words and ignores extra space', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('   ')).toBe(0);
    expect(wordCount(' one  two\nthree ')).toBe(3);
  });
});

describe('statement drafting', () => {
  it('needs who, the pain, three whys and the consequence', () => {
    expect(statementMissing(emptyCanvas())).toHaveLength(6);
    let c = emptyCanvas();
    c = setField(c, 'who', 'who', 'Nurses');
    c = setField(c, 'who', 'pain', 'Handover is slow');
    c = setField(c, 'why', 'whys.0', 'Notes are scattered');
    c = setField(c, 'why', 'whys.1', 'Each team uses its own tool');
    c = setField(c, 'why', 'whys.2', 'Nobody owns the summary');
    expect(ids(statementMissing(c))).toEqual(['consequence']);
    expect(statementMissingMessage(c)).toBe('Pal needs these first: If nothing changes, what happens?');
    c = setField(c, 'why', 'consequence', 'Rounds start late');
    expect(statementMissing(c)).toEqual([]);
    expect(statementMissingMessage(c)).toBe('');
  });
  it('does not need the evidence or the parked idea', () => {
    expect(ids(statementMissing(emptyCanvas()))).not.toContain('evidence');
    expect(ids(statementMissing(emptyCanvas()))).not.toContain('parkedIdea');
  });
});

describe('questions opener', () => {
  it('uses the step short title and is recognised again', () => {
    expect(questionsOpener('bet')).toBe('Ask me questions about my riskiest bet.');
    expect(isQuestionsOpener(questionsOpener('who'))).toBe(true);
    expect(isQuestionsOpener('Grill me on my riskiest bet.')).toBe(true);
    expect(isQuestionsOpener('Nurses, mostly.')).toBe(false);
  });
});

describe('more boxes', () => {
  const why = getStep('why');
  const success = getStep('success');

  it('hides them until asked for', () => {
    const c = emptyCanvas();
    expect(ids(visibleFields(c, why, 0))).toEqual(['whys.0', 'whys.1', 'whys.2', 'consequence', 'statement']);
    expect(ids(visibleFields(c, success, 0))).toEqual(['metric', 'today']);
  });
  it('shows a hidden box once it has text', () => {
    const c = setField(emptyCanvas(), 'success', 'guardrail', 'Mistakes in the notes');
    expect(ids(visibleFields(c, success, 0))).toEqual(['metric', 'today', 'guardrail']);
  });
  it('reveals one more why at a time', () => {
    const c = emptyCanvas();
    const first = revealNext(c, why, 0);
    expect(first).toEqual({ revealed: 1, fieldId: 'whys.3' });
    expect(ids(visibleFields(c, why, 1))).toContain('whys.3');
    expect(ids(visibleFields(c, why, 1))).not.toContain('whys.4');
    const second = revealNext(c, why, 1);
    expect(second).toEqual({ revealed: 2, fieldId: 'whys.4' });
    expect(revealNext(c, why, 2)).toBeNull();
  });
  it('skips ahead of a why that already has text', () => {
    const c = setField(emptyCanvas(), 'why', 'whys.3', 'Because of the rota');
    expect(revealNext(c, why, 0)).toEqual({ revealed: 2, fieldId: 'whys.4' });
  });
  it('reveals every box on other screens in one click', () => {
    const c = emptyCanvas();
    expect(revealNext(c, success, 0)).toEqual({ revealed: 2, fieldId: 'target' });
    expect(ids(visibleFields(c, success, 2))).toEqual(['metric', 'today', 'target', 'guardrail']);
    expect(revealNext(c, success, 2)).toBeNull();
  });
});

describe('stampJoined', () => {
  it('notes the join time once and leaves the first-typing time alone', () => {
    const typed = setField(emptyCanvas(), 'who', 'who', 'Nurses');
    const joined = stampJoined(typed, 100);
    expect(joined.meta).toEqual({ joinedAt: 100, firstInputAt: 0 });
    expect(stampJoined(joined, 200)).toBe(joined);
  });
});

describe('stampMeta', () => {
  it('notes the join time once', () => {
    const joined = stampMeta(emptyCanvas(), 100);
    expect(joined.meta).toEqual({ joinedAt: 100, firstInputAt: 0 });
    expect(stampMeta(joined, 200)).toBe(joined);
  });
  it('notes the first typing once', () => {
    const joined = stampMeta(emptyCanvas(), 100);
    const typed = stampMeta(setField(joined, 'who', 'who', 'N'), 150);
    expect(typed.meta).toEqual({ joinedAt: 100, firstInputAt: 150 });
    expect(stampMeta(setField(typed, 'who', 'who', 'Nu'), 300).meta).toEqual({ joinedAt: 100, firstInputAt: 150 });
  });
  it('ignores spaces', () => {
    const joined = stampMeta(emptyCanvas(), 100);
    expect(stampMeta(setField(joined, 'who', 'who', '   '), 150).meta.firstInputAt).toBe(0);
  });
});
