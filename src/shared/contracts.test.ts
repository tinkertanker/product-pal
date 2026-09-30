import { describe, expect, it } from 'vitest';
import { clarificationsFrom, fingerprint, nicknameFor } from './contracts';

describe('fingerprint', () => {
  it('is stable and changes with the text', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'));
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'));
    expect(fingerprint('')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('nicknameFor', () => {
  it('gives the same friendly two-word name for the same id', () => {
    expect(nicknameFor('client-1')).toBe(nicknameFor('client-1'));
    expect(nicknameFor('client-1')).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });
});

describe('clarificationsFrom', () => {
  it('drops the automatic opener and the coach turns', () => {
    const out = clarificationsFrom({
      why: [
        { role: 'user', content: 'Grill me on my why.' },
        { role: 'assistant', content: 'Q1 …' },
        { role: 'user', content: "It's not about being new." },
      ],
      idea: [{ role: 'user', content: 'Grill me on my idea.' }],
    });
    expect(out).toEqual({ why: ["It's not about being new."] });
  });

  it('keeps only the latest ten answers, each clamped', () => {
    const chat = [{ role: 'user' as const, content: 'opener' }, ...Array.from({ length: 12 }, (_, i) => ({ role: 'user' as const, content: `a${i}`.padEnd(5000, 'x') }))];
    const out = clarificationsFrom({ problem: chat });
    expect(out.problem).toHaveLength(10);
    expect(out.problem?.[0]?.startsWith('a2')).toBe(true);
    expect(out.problem?.[0]?.length).toBe(4000);
  });
});
