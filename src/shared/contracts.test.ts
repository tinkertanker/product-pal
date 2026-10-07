import { describe, expect, it } from 'vitest';
import { COACH_MODES, CLARIFICATIONS_PER_STEP, clarificationsFrom, fingerprint, nicknameFor } from './contracts';

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

describe('COACH_MODES', () => {
  it('are the six modes of the new flow', () => {
    expect([...COACH_MODES]).toEqual(['nudge', 'questions', 'statement', 'assumptions', 'brief', 'review']);
  });
});

describe('clarificationsFrom', () => {
  it('preserves the question that gives a short answer its meaning', () => {
    const out = clarificationsFrom({ bet: [
      { role: 'user', content: 'Ask me questions about my bet.' },
      { role: 'assistant', content: 'Will you test with nurses or managers?' },
      { role: 'user', content: 'Nurses, not managers.' },
    ] });
    expect(out.bet?.[0]).toContain('Will you test with nurses or managers?');
    expect(out.bet?.[0]).toContain('Participant: Nurses, not managers.');
  });

  it('drops the automatic opener and labels the coach as context, not evidence', () => {
    const out = clarificationsFrom({
      why: [
        { role: 'user', content: 'Ask me questions about my why.' },
        { role: 'assistant', content: 'Q1 …' },
        { role: 'user', content: "It's not about being new." },
      ],
      who: [{ role: 'user', content: 'Ask me questions about my person and their pain.' }],
    });
    expect(out).toEqual({ why: ["Pal asked or said (not evidence): Q1 …\nParticipant: It's not about being new."] });
  });

  it('keeps only the latest ten answers, each clamped', () => {
    const chat = [{ role: 'user' as const, content: 'opener' }, ...Array.from({ length: 12 }, (_, i) => ({ role: 'user' as const, content: `a${i}`.padEnd(5000, 'x') }))];
    const out = clarificationsFrom({ bet: chat });
    expect(out.bet).toHaveLength(CLARIFICATIONS_PER_STEP);
    expect(out.bet?.[0]?.startsWith('a2')).toBe(true);
    expect(out.bet?.[0]?.length).toBe(4000);
  });
});
