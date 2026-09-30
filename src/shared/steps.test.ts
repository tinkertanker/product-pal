import { describe, expect, it } from 'vitest';
import { STEPS, approxDuration, getStep, totalMinutes } from './steps';

describe('step timings', () => {
  it('adds up to about an hour', () => {
    expect(totalMinutes()).toBe(61);
    expect(approxDuration(totalMinutes())).toBe('about an hour');
  });
  it('describes shorter and longer runs in minutes', () => {
    expect(approxDuration(40)).toBe('about 40 minutes');
    expect(approxDuration(90)).toBe('about 90 minutes');
  });
  it('keeps a label for every step', () => {
    for (const step of STEPS) expect(step.minutesLabel.startsWith(String(step.minutes))).toBe(true);
  });
});

describe('the assumption step', () => {
  it('asks for a test that fits into the next 30 minutes', () => {
    const test = getStep('assumption').fields.find((f) => f.id === 'test');
    expect(test?.label).toBe('The quickest test you could run in the next 30 minutes, without writing any code');
    expect(test?.placeholder).toBe('Ask three people nearby, try it by hand, sketch it on paper, check with a mentor');
  });
});
