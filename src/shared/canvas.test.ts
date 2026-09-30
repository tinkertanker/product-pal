import { describe, expect, it } from 'vitest';
import {
  canChallenge,
  canvasToMarkdown,
  completedCount,
  emptyCanvas,
  getField,
  isStepComplete,
  missingCoachSteps,
  normaliseCanvas,
  setField,
} from './canvas';
import { filledCanvas } from './fixtures';

describe('isStepComplete', () => {
  it('is false for an empty canvas and true for a filled one', () => {
    const empty = emptyCanvas();
    const full = filledCanvas();
    for (const id of ['idea', 'why', 'problem', 'metric', 'assumption', 'experience'] as const) {
      expect(isStepComplete(empty, id)).toBe(false);
      expect(isStepComplete(full, id)).toBe(true);
    }
  });
  it('needs each required field to have 10 non-space characters', () => {
    const c = setField(filledCanvas(), 'idea', 'who', 'a  b  c d');
    expect(isStepComplete(c, 'idea')).toBe(false);
    expect(isStepComplete(setField(c, 'idea', 'who', 'nurses on nights'), 'idea')).toBe(true);
  });
  it('treats the 11-star field as optional', () => {
    expect(getField(filledCanvas(), 'experience', 'elevenStar')).toBe('');
    expect(isStepComplete(filledCanvas(), 'experience')).toBe(true);
  });
  it('needs three of the five whys plus the statement for the why step', () => {
    let c = emptyCanvas();
    c = setField(c, 'why', 'whys.0', 'Staff miss follow-up emails');
    c = setField(c, 'why', 'whys.4', 'Because nobody owns the inbox');
    c = setField(c, 'why', 'whys.2', 'Because the inbox is shared');
    c = setField(c, 'why', 'statement', 'Staff need follow-ups to land; otherwise clients leave.');
    expect(isStepComplete(c, 'why')).toBe(true);
    expect(isStepComplete(setField(c, 'why', 'whys.4', ''), 'why')).toBe(false);
    expect(isStepComplete(setField(c, 'why', 'statement', 'short'), 'why')).toBe(false);
  });
  it('completes the build step once a prompt exists', () => {
    const c = filledCanvas();
    expect(isStepComplete(c, 'build')).toBe(false);
    c.build.prompt = '## Context\nSomething real.';
    expect(isStepComplete(c, 'build')).toBe(true);
  });
  it('counts completed steps and lists the missing ones', () => {
    expect(completedCount(emptyCanvas())).toBe(0);
    expect(completedCount(filledCanvas())).toBe(6);
    const c = setField(filledCanvas(), 'metric', 'target', '');
    expect(missingCoachSteps(c)).toEqual(['metric']);
  });
});

describe('canChallenge', () => {
  it('needs 15 characters in the main field', () => {
    expect(canChallenge(emptyCanvas(), 'idea')).toBe(false);
    expect(canChallenge(setField(emptyCanvas(), 'idea', 'oneLine', 'too short'), 'idea')).toBe(false);
    expect(canChallenge(setField(emptyCanvas(), 'idea', 'oneLine', 'A tool that helps nurses'), 'idea')).toBe(true);
  });
  it('is never true for the build step', () => {
    expect(canChallenge(filledCanvas(), 'build')).toBe(false);
  });
  it('looks at the right main field per step', () => {
    expect(canChallenge(setField(emptyCanvas(), 'metric', 'primary', 'Minutes to complete a handover'), 'metric')).toBe(true);
    expect(canChallenge(setField(emptyCanvas(), 'metric', 'target', 'Under ten minutes by June'), 'metric')).toBe(false);
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

describe('normaliseCanvas', () => {
  it('returns an empty canvas for junk', () => {
    expect(normaliseCanvas(null)).toEqual(emptyCanvas());
    expect(normaliseCanvas('nope')).toEqual(emptyCanvas());
  });
  it('keeps good values and drops bad ones', () => {
    const c = normaliseCanvas({
      idea: { who: 'nurses', pain: 42 },
      why: { whys: ['a', 'b'], statement: 's' },
      build: { platform: 'nonsense', includeGrill: false, prompt: 'p' },
      chats: { idea: [{ role: 'user', content: 'hi' }, { role: 'system', content: 'x' }] },
    });
    expect(c.idea.who).toBe('nurses');
    expect(c.idea.pain).toBe('');
    expect(c.why.whys).toHaveLength(5);
    expect(c.build.platform).toBe('claude-code');
    expect(c.build.includeGrill).toBe(false);
    expect(c.chats.idea).toEqual([{ role: 'user', content: 'hi' }]);
  });
});

describe('canvasToMarkdown', () => {
  it('has a heading per step and skips empty fields', () => {
    const md = canvasToMarkdown(filledCanvas());
    expect(md).toContain('# Product canvas');
    expect(md).toContain('## 1. Your idea');
    expect(md).toContain('## 7. Build prompt');
    expect(md).toContain('**Who is this for?**\n\nnew nurses on night shift');
    expect(md).not.toContain('11-star');
    expect(md).toContain('_Not written yet._');
  });
  it('marks empty steps', () => {
    expect(canvasToMarkdown(emptyCanvas())).toContain('_Not filled in yet._');
  });
  it('includes the build prompt in a fence that cannot be closed early', () => {
    const c = filledCanvas();
    c.build.prompt = 'Before\n```js\ncode\n```\nAfter';
    c.build.platform = 'lovable';
    const md = canvasToMarkdown(c);
    expect(md).toContain('**Coding tool:** Lovable');
    expect(md).toContain('````markdown\nBefore');
    expect(md.trimEnd().endsWith('````')).toBe(true);
  });
});
