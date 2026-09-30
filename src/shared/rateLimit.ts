// Sliding-window rate limiting. The maths is pure; callers pass `now` in.

export type WindowResult = {
  allowed: boolean;
  /** Timestamps still inside the window (plus `now` if allowed). */
  hits: number[];
  /** How long until a slot frees up, when denied. */
  retryAfterMs: number;
};

export function slidingWindow(hits: readonly number[], now: number, limit: number, windowMs: number): WindowResult {
  const recent = hits.filter((t) => t > now - windowMs);
  if (recent.length >= limit) {
    const oldest = recent[0] ?? now;
    return { allowed: false, hits: recent, retryAfterMs: Math.max(0, oldest + windowMs - now) };
  }
  return { allowed: true, hits: [...recent, now], retryAfterMs: 0 };
}

export type RateRule = { key: string; limit: number; windowMs: number };

export type TakeResult = { allowed: boolean; retryAfterMs: number };

/**
 * In-memory store for several rules at once. A request is counted against
 * every rule only if it passes all of them.
 */
export class RateLimiter {
  private readonly store = new Map<string, number[]>();

  private evaluate(rules: readonly RateRule[], now: number) {
    return rules.map((rule) => ({
      rule,
      result: slidingWindow(this.store.get(rule.key) ?? [], now, rule.limit, rule.windowMs),
    }));
  }

  /** Would a request pass right now? Records nothing. */
  peek(rules: readonly RateRule[], now: number): TakeResult {
    const denied = this.evaluate(rules, now).filter((e) => !e.result.allowed);
    if (denied.length > 0) {
      return { allowed: false, retryAfterMs: Math.max(...denied.map((e) => e.result.retryAfterMs)) };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  take(rules: readonly RateRule[], now: number): TakeResult {
    const evaluated = this.evaluate(rules, now);
    const denied = evaluated.filter((e) => !e.result.allowed);
    if (denied.length > 0) {
      return { allowed: false, retryAfterMs: Math.max(...denied.map((e) => e.result.retryAfterMs)) };
    }
    for (const { rule, result } of evaluated) this.store.set(rule.key, result.hits);
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Drop keys with no recent hits so the map cannot grow forever. */
  prune(now: number, windowMs: number): void {
    for (const [key, hits] of this.store) {
      if (!hits.some((t) => t > now - windowMs)) this.store.delete(key);
    }
  }

  get size(): number {
    return this.store.size;
  }
}

export const COACH_WINDOW_MS = 5 * 60 * 1000;
export const COACH_LIMIT_PER_CLIENT = 20;
export const COACH_LIMIT_PER_IP = 600;

export function coachRules(clientId: string, ip: string): RateRule[] {
  return [
    { key: `client:${clientId}`, limit: COACH_LIMIT_PER_CLIENT, windowMs: COACH_WINDOW_MS },
    { key: `ip:${ip}`, limit: COACH_LIMIT_PER_IP, windowMs: COACH_WINDOW_MS },
  ];
}

export const CODE_WINDOW_MS = 5 * 60 * 1000;
export const CODE_FAILURES_PER_IP = 300;

/** Wrong-code attempts, counted per IP so the code cannot be guessed at speed. */
export function codeFailureRules(ip: string): RateRule[] {
  return [{ key: `codefail:${ip}`, limit: CODE_FAILURES_PER_IP, windowMs: CODE_WINDOW_MS }];
}

export function retryMessage(retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  const wait = seconds >= 90 ? `${Math.ceil(seconds / 60)} minutes` : `${seconds} seconds`;
  return `You're asking the coach a lot, and it needs a breather. Try again in about ${wait}.`;
}
