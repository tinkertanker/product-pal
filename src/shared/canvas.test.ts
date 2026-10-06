import { describe, expect, it } from 'vitest';
import {
  STEP_IDS,
  canvasToMarkdown,
  completedCount,
  currentJudgement,
  emptyCanvas,
  emptyRequiredFields,
  fieldLabel,
  getField,
  hasAnyInput,
  hasDocument,
  isFieldShown,
  isStepComplete,
  isStepInputDone,
  judgedFields,
  missingBeforeBrief,
  normaliseCanvas,
  normaliseDone,
  nothingLeftEmpty,
  requiredFields,
  setField,
  stepFingerprint,
  stepText,
} from './canvas';
import { briefedCanvas, filledCanvas, unparkedCanvas } from './fixtures';
import { getStep } from './steps';

describe('isStepComplete', () => {
  it('is false for an empty canvas', () => {
    for (const id of STEP_IDS) expect(isStepComplete(emptyCanvas(), id)).toBe(false);
  });
  it('is true for the four thinking steps once their boxes are filled, and for the brief once it is written', () => {
    const full = filledCanvas();
    for (const id of ['who', 'why', 'success', 'bet'] as const) expect(isStepComplete(full, id)).toBe(true);
    expect(isStepComplete(full, 'brief')).toBe(false);
    expect(isStepComplete(briefedCanvas(), 'brief')).toBe(true);
    expect(completedCount(full)).toBe(4);
    expect(completedCount(briefedCanvas())).toBe(5);
    expect(completedCount(emptyCanvas())).toBe(0);
  });
  it('needs each required box to have 10 non-space characters when the judge is off', () => {
    const c = setField(filledCanvas(), 'who', 'who', 'a  b  c d');
    expect(isStepComplete(c, 'who')).toBe(false);
    expect(isStepComplete(setField(c, 'who', 'who', 'nurses on nights'), 'who')).toBe(true);
  });
  it('needs three whys, the consequence and the statement for the why step', () => {
    let c = emptyCanvas();
    c = setField(c, 'why', 'whys.0', 'Staff miss follow-up emails');
    c = setField(c, 'why', 'whys.1', 'Because nobody owns the inbox');
    c = setField(c, 'why', 'whys.2', 'Because the inbox is shared');
    c = setField(c, 'why', 'consequence', 'Clients leave without an answer.');
    c = setField(c, 'why', 'statement', 'Staff need follow-ups to land; otherwise clients leave.');
    expect(isStepComplete(c, 'why')).toBe(true);
    expect(isStepComplete(setField(c, 'why', 'whys.2', ''), 'why')).toBe(false);
    expect(isStepComplete(setField(c, 'why', 'statement', 'short'), 'why')).toBe(false);
  });
  it('treats the fourth and fifth why as optional', () => {
    expect(getField(filledCanvas(), 'why', 'whys.3')).toBe('');
    expect(isStepComplete(filledCanvas(), 'why')).toBe(true);
  });
});

describe('the box asked only when no idea is parked', () => {
  it('is required and shown without a parked idea, and hidden with one', () => {
    const smallest = getStep('brief').fields.find((f) => f.id === 'smallestBuild');
    expect(smallest).toBeDefined();
    if (!smallest) return;
    expect(isFieldShown(filledCanvas(), smallest)).toBe(false);
    expect(isFieldShown(unparkedCanvas(), smallest)).toBe(true);
    expect(requiredFields(filledCanvas(), 'brief').map((f) => f.id)).toEqual(['firstTwoMinutes', 'unhappyPath']);
    expect(requiredFields(unparkedCanvas(), 'brief').map((f) => f.id)).toEqual(['firstTwoMinutes', 'unhappyPath', 'smallestBuild']);
  });
  it('lists it as empty when it is missing', () => {
    const c = setField(unparkedCanvas(), 'brief', 'smallestBuild', '');
    expect(emptyRequiredFields(c, 'brief').map((f) => f.id)).toEqual(['smallestBuild']);
    expect(nothingLeftEmpty(c, 'brief')).toBe(false);
  });
});

describe('what the checker looks at', () => {
  it('leaves out the parked idea, so editing it does not make a check stale', () => {
    const before = filledCanvas();
    const after = setField(before, 'who', 'parkedIdea', 'A totally different idea.');
    expect(judgedFields(before, 'who').map((f) => f.id)).toEqual(['who', 'pain', 'evidence']);
    expect(stepText(after, 'who')).toBe(stepText(before, 'who'));
    expect(stepFingerprint(after, 'who')).toBe(stepFingerprint(before, 'who'));
    expect(stepFingerprint(setField(before, 'who', 'pain', 'Something else entirely.'), 'who')).not.toBe(stepFingerprint(before, 'who'));
  });
  it('leaves out the hidden smallest-build box, and includes it when it shows', () => {
    expect(judgedFields(filledCanvas(), 'brief').map((f) => f.id)).not.toContain('smallestBuild');
    expect(judgedFields(unparkedCanvas(), 'brief').map((f) => f.id)).toContain('smallestBuild');
  });
});

describe('judged completion', () => {
  const judgement = (c: ReturnType<typeof filledCanvas>, pass: boolean) => ({
    step: 'who' as const,
    pass,
    checks: [],
    fingerprint: stepFingerprint(c, 'who'),
    at: 1,
  });
  it('needs a passing, current judgement', () => {
    const c = filledCanvas();
    expect(isStepInputDone(c, 'who', { judge: true })).toBe(false);
    c.judgements.who = judgement(c, true);
    expect(isStepInputDone(c, 'who', { judge: true })).toBe(true);
    expect(currentJudgement(c, 'who')?.pass).toBe(true);
    const edited = setField(c, 'who', 'pain', 'A different difficulty altogether.');
    expect(currentJudgement(edited, 'who')).toBeUndefined();
    expect(isStepInputDone(edited, 'who', { judge: true })).toBe(false);
    c.judgements.who = judgement(c, false);
    expect(isStepInputDone(c, 'who', { judge: true })).toBe(false);
  });
});

describe('missingBeforeBrief', () => {
  it('lists thinking steps that are not done, and the brief boxes', () => {
    expect(missingBeforeBrief(emptyCanvas())).toEqual(['who', 'why', 'success', 'bet', 'brief']);
    expect(missingBeforeBrief(filledCanvas())).toEqual([]);
    const c = setField(setField(filledCanvas(), 'success', 'today', ''), 'brief', 'unhappyPath', '');
    expect(missingBeforeBrief(c)).toEqual(['success', 'brief']);
  });
});

describe('hasAnyInput / hasDocument', () => {
  it('notices typing in any box', () => {
    expect(hasAnyInput(emptyCanvas())).toBe(false);
    expect(hasAnyInput(setField(emptyCanvas(), 'bet', 'passMark', '2 of 3'))).toBe(true);
    expect(hasAnyInput(setField(emptyCanvas(), 'who', 'parkedIdea', 'An app'))).toBe(true);
  });
  it('needs a document of some length', () => {
    expect(hasDocument(filledCanvas())).toBe(false);
    expect(hasDocument(briefedCanvas())).toBe(true);
  });
});

describe('getField / setField', () => {
  it('reads and writes the whys by index without mutating', () => {
    const before = emptyCanvas();
    const after = setField(before, 'why', 'whys.3', 'Fourth why');
    expect(getField(after, 'why', 'whys.3')).toBe('Fourth why');
    expect(before.why.whys[3]).toBe('');
  });
});

describe('fieldLabel', () => {
  it('quotes the earlier answer, and falls back to the plain label while it is empty', () => {
    const c = filledCanvas();
    const second = getStep('why').fields.find((f) => f.id === 'whys.1');
    expect(second).toBeDefined();
    if (!second) return;
    expect(fieldLabel(c, second)).toContain('Notes live in three different systems.');
    expect(fieldLabel(emptyCanvas(), second)).toBe('And why is that?');
  });
});

describe('normaliseCanvas', () => {
  it('returns an empty canvas for junk', () => {
    expect(normaliseCanvas(null)).toEqual(emptyCanvas());
    expect(normaliseCanvas('nope')).toEqual(emptyCanvas());
  });
  it('keeps good values and drops bad ones', () => {
    const c = normaliseCanvas({
      who: { who: 'nurses', pain: 42 },
      why: { whys: ['a', 'b'], statement: 's' },
      brief: { platform: 'nonsense', document: 'p' },
      chats: { who: [{ role: 'user', content: 'hi' }, { role: 'system', content: 'x' }] },
      meta: { joinedAt: 5, firstInputAt: 'soon' },
    });
    expect(c.who.who).toBe('nurses');
    expect(c.who.pain).toBe('');
    expect(c.why.whys).toHaveLength(5);
    expect(c.brief.platform).toBe('claude-code');
    expect(c.brief.document).toBe('p');
    expect(c.chats.who).toEqual([{ role: 'user', content: 'hi' }]);
    expect(c.meta).toEqual({ joinedAt: 5, firstInputAt: 0 });
  });
  it('upgrades a canvas saved by the first version', () => {
    const v1 = {
      idea: { who: 'new nurses', pain: 'Hunting for notes', wish: 'a summary', oneLine: 'A handover summary' },
      why: { whys: ['a', 'b', 'c', '', ''], statement: 'old why statement' },
      problem: { consequence: 'Late rounds', statement: 'The problem statement', confirmation: 'I timed it' },
      metric: { primary: 'Minutes per handover', baseline: '22', target: '10', guardrail: 'Errors' },
      assumption: { riskiest: 'They will trust it', test: 'Ask three', threshold: '2 of 3' },
      experience: { where: 'Chat', firstTwoMinutes: 'Open chat', unhappyPath: 'Card says so' },
      build: { platform: 'codex', otherPlatform: '', includeGrill: true, prompt: 'Build this.' },
      chats: { idea: [{ role: 'user', content: 'hi' }], metric: [{ role: 'user', content: 'there' }] },
      judgements: { idea: { step: 'idea', pass: true, fingerprint: 'abc', at: 1, checks: [] } },
    };
    const c = normaliseCanvas(v1);
    expect(c.who).toEqual({ who: 'new nurses', pain: 'Hunting for notes', evidence: 'I timed it', parkedIdea: 'A handover summary' });
    expect(c.why.consequence).toBe('Late rounds');
    expect(c.why.statement).toBe('The problem statement');
    expect(c.success).toEqual({ metric: 'Minutes per handover', today: '22', target: '10', guardrail: 'Errors' });
    expect(c.bet).toEqual({ assumption: 'They will trust it', test: 'Ask three', passMark: '2 of 3' });
    expect(c.brief).toMatchObject({ firstTwoMinutes: 'Open chat', unhappyPath: 'Card says so', where: 'Chat', platform: 'codex', document: 'Build this.' });
    expect(c.chats.who).toEqual([{ role: 'user', content: 'hi' }]);
    expect(c.chats.success).toEqual([{ role: 'user', content: 'there' }]);
    expect(c.judgements).toEqual({});
  });
  it('keeps judgements, including the fix line', () => {
    const c = normaliseCanvas({
      judgements: { who: { pass: false, fingerprint: 'f', at: 3, checks: [{ id: 'a', label: 'A', probability: 0.2, pass: false, fix: 'Do this.' }, { id: 5 }] } },
    });
    expect(c.judgements.who?.checks).toEqual([{ id: 'a', label: 'A', probability: 0.2, pass: false, fix: 'Do this.' }]);
  });
});

describe('normaliseDone', () => {
  it('maps the first version step ids onto today', () => {
    expect(normaliseDone(['idea', 'problem', 'build', 'why'])).toEqual(['who', 'why', 'brief']);
    expect(normaliseDone(['bet', 'success'])).toEqual(['success', 'bet']);
    expect(normaliseDone(['nope', 5])).toEqual([]);
    expect(normaliseDone('why')).toEqual([]);
  });
});

describe('canvasToMarkdown', () => {
  it('puts the brief first, then the notes with a heading per step', () => {
    const md = canvasToMarkdown(briefedCanvas());
    expect(md.startsWith('# Handover summary: product brief')).toBe(true);
    expect(md).toContain('\n---\n\n# My notes');
    expect(md).toContain('## 1. Who hurts');
    expect(md).toContain('## 5. Your brief');
    expect(md).toContain('**Who is this for?**\n\nNew nurses on night shift');
    expect(md.endsWith('\n')).toBe(true);
  });
  it('is just the notes when there is no brief yet, and marks empty steps', () => {
    const md = canvasToMarkdown(emptyCanvas());
    expect(md.startsWith('# My notes')).toBe(true);
    expect(md).toContain('_Not filled in yet._');
  });
  it('uses the plain label for quoted boxes', () => {
    const md = canvasToMarkdown(filledCanvas());
    expect(md).toContain('**And why is that? (2)**');
    expect(md).not.toContain('“');
  });
});
