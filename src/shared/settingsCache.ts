// A tiny time-to-live cache for the public settings. Pure: `now` comes in.

/** D1 is read at most once per isolate in this time, however many people ask. */
export const SETTINGS_TTL_MS = 30_000;

export type Cached<T> = { value: T; at: number };

/** The cached value if it is younger than the TTL. */
export function freshValue<T>(cache: Cached<T> | null, now: number, ttl: number = SETTINGS_TTL_MS): T | undefined {
  return cache && now - cache.at < ttl && now >= cache.at ? cache.value : undefined;
}

/** Whatever is cached, however old: for when the database lets us down. */
export function staleValue<T>(cache: Cached<T> | null): T | undefined {
  return cache?.value;
}

export const cacheOf = <T>(value: T, now: number): Cached<T> => ({ value, at: now });
