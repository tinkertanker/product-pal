import { describe, expect, it } from 'vitest';
import { checkBuildPrompt, checklistSummary, keywords, mentions, wordCount } from './checkBuildPrompt';
import { filledCanvas } from './fixtures';

const GOOD = `Before you write any code, grill me.

## Context
New nurses on night shift spend twenty minutes hunting for handover notes across three systems.

## Problem
New night nurses need to find patient changes at handover because notes are scattered.

## What success looks like
Metric: minutes to complete a shift handover. Baseline 22 minutes. Target under 10. Guardrail: medication error rate.

## First version
The smallest thing that tests our riskiest assumption, that nurses trust a summary they did not write.
- As a night nurse, I want one card per patient, so that I see what changed.

## The first two minutes
The nurse opens the ward chat, sees one card per patient with what changed, and taps a card to see the source note.

## When things go wrong
If a note is missing, the card says so and shows who to call.

## Out of scope for now
Integrations with the records system. Mobile app. Editing notes.`;

describe('checkBuildPrompt', () => {
  it('passes every check on a good prompt', () => {
    const items = checkBuildPrompt(GOOD, filledCanvas());
    expect(items.filter((i) => !i.pass).map((i) => i.id)).toEqual([]);
    expect(checklistSummary(items)).toEqual({ passed: 8, total: 8 });
  });
  it('fails everything on an empty prompt', () => {
    const items = checkBuildPrompt('   ', filledCanvas());
    expect(items.every((i) => !i.pass)).toBe(true);
    expect(items).toHaveLength(8);
  });
  it('fails a vague prompt on the right items', () => {
    const items = checkBuildPrompt('Build a chatbot that helps with handovers.', filledCanvas());
    const failed = items.filter((i) => !i.pass).map((i) => i.id);
    expect(failed).toContain('user');
    expect(failed).toContain('metric');
    expect(failed).toContain('outOfScope');
    expect(failed).toContain('unhappy');
    expect(items.find((i) => i.id === 'length')?.pass).toBe(true);
  });
  it('flags an over-long prompt', () => {
    const long = GOOD + ' word'.repeat(1300);
    const items = checkBuildPrompt(long, filledCanvas());
    expect(items.find((i) => i.id === 'length')?.pass).toBe(false);
    expect(items.find((i) => i.id === 'user')?.pass).toBe(true);
  });
  it('spots a missing out-of-scope section', () => {
    const items = checkBuildPrompt(GOOD.replace(/## Out of scope for now[\s\S]*$/, ''), filledCanvas());
    expect(items.find((i) => i.id === 'outOfScope')?.pass).toBe(false);
  });
});

describe('helpers', () => {
  it('counts words', () => {
    expect(wordCount('one two  three\nfour')).toBe(4);
    expect(wordCount('')).toBe(0);
  });
  it('extracts distinctive keywords', () => {
    expect(keywords('The new nurses on night shift')).toEqual(['nurses', 'night', 'shift']);
  });
  it('mentions needs enough overlap', () => {
    expect(mentions('night nurses use it', 'new nurses on night shift')).toBe(true);
    expect(mentions('lawyers only', 'new nurses on night shift')).toBe(false);
    expect(mentions('anything', '')).toBe(false);
  });
});
