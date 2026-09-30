import { describe, expect, it } from 'vitest';
import { RateLimiter, coachRules, retryMessage, slidingWindow } from './rateLimit';

describe('slidingWindow', () => {
  it('allows up to the limit and then denies', () => {
    let hits: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = slidingWindow(hits, 1000 + i, 3, 10_000);
      expect(r.allowed).toBe(true);
      hits = r.hits;
    }
    const denied = slidingWindow(hits, 1003, 3, 10_000);
    expect(denied.allowed).toBe(false);
    expect(denied.hits).toHaveLength(3);
  });
  it('reports when the oldest hit leaves the window', () => {
    const denied = slidingWindow([1000, 2000], 5000, 2, 10_000);
    expect(denied.retryAfterMs).toBe(6000);
  });
  it('frees slots as hits age out', () => {
    const r = slidingWindow([1000, 2000], 11_500, 2, 10_000);
    expect(r.allowed).toBe(true);
    expect(r.hits).toEqual([2000, 11_500]);
  });
  it('treats a hit exactly one window old as expired', () => {
    expect(slidingWindow([1000], 11_000, 1, 10_000).allowed).toBe(true);
  });
});

describe('RateLimiter', () => {
  it('limits per client and per IP independently', () => {
    const limiter = new RateLimiter();
    const rules = (client: string) => [
      { key: `client:${client}`, limit: 2, windowMs: 1000 },
      { key: 'ip:1.2.3.4', limit: 3, windowMs: 1000 },
    ];
    expect(limiter.take(rules('a'), 0).allowed).toBe(true);
    expect(limiter.take(rules('a'), 1).allowed).toBe(true);
    expect(limiter.take(rules('a'), 2).allowed).toBe(false); // client limit
    expect(limiter.take(rules('b'), 3).allowed).toBe(true); // ip: third hit
    expect(limiter.take(rules('c'), 4).allowed).toBe(false); // ip limit
  });
  it('does not count a denied request against the other rule', () => {
    const limiter = new RateLimiter();
    const rules = [
      { key: 'client:a', limit: 1, windowMs: 1000 },
      { key: 'ip:x', limit: 2, windowMs: 1000 },
    ];
    limiter.take(rules, 0);
    limiter.take(rules, 1); // denied by client
    limiter.take(rules, 2); // denied by client
    const other = [
      { key: 'client:b', limit: 1, windowMs: 1000 },
      { key: 'ip:x', limit: 2, windowMs: 1000 },
    ];
    expect(limiter.take(other, 3).allowed).toBe(true); // ip has only 2 recorded hits
  });
  it('peek reports without recording', () => {
    const limiter = new RateLimiter();
    const rules = [{ key: 'k', limit: 1, windowMs: 1000 }];
    expect(limiter.peek(rules, 0).allowed).toBe(true);
    expect(limiter.peek(rules, 1).allowed).toBe(true);
    limiter.take(rules, 2);
    expect(limiter.peek(rules, 3).allowed).toBe(false);
  });
  it('prunes idle keys', () => {
    const limiter = new RateLimiter();
    limiter.take([{ key: 'k', limit: 1, windowMs: 100 }], 0);
    expect(limiter.size).toBe(1);
    limiter.prune(1000, 100);
    expect(limiter.size).toBe(0);
  });
  it('uses 20 per client and 600 per IP for the coach', () => {
    const [client, ip] = coachRules('abc', '9.9.9.9');
    expect(client).toMatchObject({ key: 'client:abc', limit: 20, windowMs: 300_000 });
    expect(ip).toMatchObject({ key: 'ip:9.9.9.9', limit: 600, windowMs: 300_000 });
  });
});

describe('retryMessage', () => {
  it('speaks in seconds or minutes', () => {
    expect(retryMessage(12_000)).toContain('12 seconds');
    expect(retryMessage(200_000)).toContain('4 minutes');
  });
});
