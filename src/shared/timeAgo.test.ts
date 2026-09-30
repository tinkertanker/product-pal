import { describe, expect, it } from 'vitest';
import { timeAgo } from './timeAgo';

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
