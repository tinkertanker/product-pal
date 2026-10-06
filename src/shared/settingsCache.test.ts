import { describe, expect, it } from 'vitest';
import { SETTINGS_TTL_MS, cacheOf, freshValue, staleValue } from './settingsCache';

describe('settings cache', () => {
  const cache = cacheOf({ a: 1 }, 1000);
  it('serves a value younger than 30 seconds', () => {
    expect(SETTINGS_TTL_MS).toBe(30_000);
    expect(freshValue(cache, 1000)).toEqual({ a: 1 });
    expect(freshValue(cache, 30_999)).toEqual({ a: 1 });
  });
  it('lets go of it at 30 seconds', () => {
    expect(freshValue(cache, 31_000)).toBeUndefined();
  });
  it('has nothing fresh when empty or when the clock went backwards', () => {
    expect(freshValue(null, 1)).toBeUndefined();
    expect(freshValue(cache, 500)).toBeUndefined();
  });
  it('still offers an old value as stale', () => {
    expect(staleValue(cache)).toEqual({ a: 1 });
    expect(staleValue(null)).toBeUndefined();
  });
});
