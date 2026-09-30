// Rate-limit policy. The counting itself lives in the Workers Rate Limiting
// bindings (see wrangler.jsonc); this file only decides the keys and wording.

export const RATE_LIMIT_MESSAGE = "You're asking the coach a lot, and it needs a breather. Try again in about a minute.";
export const RETRY_AFTER_SECONDS = 60;

export const clientKey = (clientId: string): string => `client:${clientId}`;
export const ipKey = (ip: string | null | undefined): string => `ip:${ip?.trim() || 'unknown'}`;
export const codeFailKey = (ip: string | null | undefined): string => `codefail:${ip?.trim() || 'unknown'}`;

/** The minimum a rate-limit binding must offer. Absent (tests, misconfiguration) means no limit. */
export type Limiter = { limit(options: { key: string }): Promise<{ success: boolean }> };

/**
 * Take one slot per key from each limiter. Denied as soon as any limiter says
 * no. A missing limiter, or one that throws, lets the request through: better
 * an unlimited coach than a broken one.
 */
export async function takeAll(checks: readonly { limiter: Limiter | undefined; key: string }[]): Promise<boolean> {
  for (const { limiter, key } of checks) {
    if (!limiter) continue;
    try {
      if (!(await limiter.limit({ key })).success) return false;
    } catch {
      /* fail open */
    }
  }
  return true;
}
