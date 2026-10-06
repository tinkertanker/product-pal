import { describe, expect, it } from 'vitest';
import { STEP_IDS } from './canvas';
import { STEPS, approxDuration, embedUrl, getStep, totalMinutes } from './steps';

const allText = (): string[] =>
  STEPS.flatMap((s) => [
    s.title,
    s.shortTitle,
    s.intro,
    s.nudge,
    s.moreLabel ?? '',
    ...s.fields.flatMap((f) => [f.label, f.helper ?? '', f.placeholder ?? '', f.exportLabel ?? '', f.quote?.template ?? '']),
  ]);

describe('the five steps', () => {
  it('are who, why, success, bet and brief, numbered in order', () => {
    expect(STEPS.map((s) => s.id)).toEqual([...STEP_IDS]);
    expect(STEPS.map((s) => s.number)).toEqual([1, 2, 3, 4, 5]);
    expect(getStep('bet').title).toBe('Riskiest bet');
  });
  it('ask for 14 typed, required boxes in all (the drafted statement is on top)', () => {
    const typed = STEPS.flatMap((s) => s.fields).filter((f) => f.required && !f.drafted);
    expect(typed).toHaveLength(14);
    const perStep = Object.fromEntries(STEPS.map((s) => [s.id, s.fields.filter((f) => f.required && !f.drafted).length]));
    expect(perStep).toEqual({ who: 3, why: 4, success: 2, bet: 3, brief: 2 });
    expect(STEPS.flatMap((s) => s.fields).filter((f) => f.drafted).map((f) => f.id)).toEqual(['statement']);
  });
  it('keep the intro to one short line', () => {
    for (const s of STEPS) expect(s.intro.split(/\s+/).length).toBeLessThanOrEqual(16);
  });
  it('use no em dashes anywhere in the copy', () => {
    for (const text of allText()) expect(text).not.toContain('—');
  });
  it('have unique box ids within a step', () => {
    for (const s of STEPS) expect(new Set(s.fields.map((f) => f.id)).size).toBe(s.fields.length);
  });
  it('point the video links at the privacy-friendly embed', () => {
    for (const s of STEPS) expect(embedUrl(s.videoId)).toContain('youtube-nocookie.com');
  });
});

describe('the bet step', () => {
  it('asks for a test that fits into 30 minutes without code', () => {
    const test = getStep('bet').fields.find((f) => f.id === 'test');
    expect(test?.label).toContain('30 minutes');
    expect(test?.label).toContain('without code');
  });
});

describe('step timings', () => {
  it('add up to about half an hour', () => {
    expect(totalMinutes()).toBe(STEPS.reduce((sum, s) => sum + s.minutes, 0));
    expect(approxDuration()).toBe('about half an hour');
  });
});
