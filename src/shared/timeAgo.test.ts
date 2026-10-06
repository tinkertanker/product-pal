import { describe, expect, it } from 'vitest';
import { startedTyping, timeAgo } from './timeAgo';

const now = 1_000_000_000_000;
describe('timeAgo', () => {
  it('reads naturally at each scale', () => {
    expect(timeAgo(now, now - 5_000)).toBe('just now');
    expect(timeAgo(now, now - 60_000)).toBe('1 min ago');
    expect(timeAgo(now, now - 125_000)).toBe('2 min ago');
    expect(timeAgo(now, now - 3 * 3_600_000)).toBe('3 h ago');
    expect(timeAgo(now, now - 50 * 3_600_000)).toBe('2 d ago');
  });
  it('treats a future time as just now', () => {
    expect(timeAgo(now, now + 10_000)).toBe('just now');
  });
});

describe('startedTyping', () => {
  it('says not started until something is typed', () => {
    expect(startedTyping({ joinedAt: 5, firstInputAt: 0 })).toBe('Not started');
  });
  it('gives the minutes between joining and first typing', () => {
    expect(startedTyping({ joinedAt: now, firstInputAt: now + 4 * 60_000 })).toBe('Started typing after 4 min');
    expect(startedTyping({ joinedAt: now, firstInputAt: now + 20_000 })).toBe('Started typing within a minute');
  });
  it('copes with an old save that has no join time', () => {
    expect(startedTyping({ joinedAt: 0, firstInputAt: now })).toBe('Started typing');
  });
});
