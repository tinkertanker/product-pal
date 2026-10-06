import { describe, expect, it } from 'vitest';
import {
  MIN_SYNC_GAP_MS,
  RETRY_FIRST_MS,
  RETRY_MAX_MS,
  afterRetryable,
  afterSaved,
  beginSend,
  nextSyncAction,
  initialSyncState,
  parseRetryAfter,
  planSend,
  withJitter,
} from './syncPolicy';

describe('withJitter', () => {
  it('spreads a delay over half to one and a half times', () => {
    expect(withJitter(10_000, () => 0)).toBe(5000);
    expect(withJitter(10_000, () => 0.5)).toBe(10_000);
    expect(withJitter(10_000, () => 0.999)).toBeLessThan(15_000);
  });
});

describe('parseRetryAfter', () => {
  it('reads whole seconds only, within reason', () => {
    expect(parseRetryAfter('60')).toBe(60);
    expect(parseRetryAfter(' 7 ')).toBe(7);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('0')).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined();
    expect(parseRetryAfter('99999')).toBeUndefined();
  });
});

describe('afterRetryable', () => {
  it('starts at 15 seconds, doubles, and stops at the cap', () => {
    let state = initialSyncState();
    const waits: number[] = [];
    for (let i = 0; i < 6; i++) {
      const next = afterRetryable(state, 0, undefined, () => 0.5);
      waits.push(next.delayMs);
      state = next.state;
    }
    expect(waits).toEqual([15_000, 30_000, 60_000, 120_000, 120_000, 120_000]);
    expect(state.base).toBe(RETRY_MAX_MS);
  });
  it('jitters each wait between half and one and a half times', () => {
    const low = afterRetryable(initialSyncState(), 0, undefined, () => 0);
    const high = afterRetryable(initialSyncState(), 0, undefined, () => 0.99);
    expect(low.delayMs).toBe(RETRY_FIRST_MS * 0.5);
    expect(high.delayMs).toBeGreaterThan(RETRY_FIRST_MS * 1.4);
    expect(high.delayMs).toBeLessThan(RETRY_FIRST_MS * 1.5);
  });
  it('sets notBefore to now plus the wait', () => {
    const { state, delayMs } = afterRetryable(initialSyncState(), 1000, undefined, () => 0.5);
    expect(state.notBefore).toBe(1000 + delayMs);
  });
  it('honours a longer Retry-After, and ignores a shorter one', () => {
    const longer = afterRetryable(initialSyncState(), 0, 60, () => 0);
    expect(longer.delayMs).toBe(60_000);
    const shorter = afterRetryable(initialSyncState(), 0, 2, () => 0.5);
    expect(shorter.delayMs).toBe(15_000);
  });
  it('spreads a Retry-After too, never below what was asked', () => {
    const { delayMs } = afterRetryable(initialSyncState(), 0, 60, () => 0.99);
    expect(delayMs).toBeGreaterThanOrEqual(60_000);
    expect(delayMs).toBeLessThanOrEqual(75_000);
  });
});

describe('afterSaved', () => {
  it('clears the back-off and records the time', () => {
    const failed = afterRetryable(initialSyncState(), 0, undefined, () => 0.5).state;
    expect(afterSaved(failed, 5000)).toEqual({ base: RETRY_FIRST_MS, notBefore: 0, lastSavedAt: 5000, inFlight: false, dirty: false });
  });
});

describe('planSend', () => {
  it('sends the first time', () => {
    expect(planSend(initialSyncState(), 1000)).toEqual({ send: true });
  });
  it('waits out a back-off, and says it is backing off', () => {
    const { state } = afterRetryable(initialSyncState(), 1000, undefined, () => 0.5);
    expect(planSend(state, 5000)).toEqual({ send: false, waitMs: 11_000, backingOff: true });
    expect(planSend(state, 16_000)).toEqual({ send: true });
  });
  it('allows one successful sync per 15 seconds', () => {
    const saved = afterSaved(initialSyncState(), 10_000);
    expect(planSend(saved, 14_000)).toEqual({ send: false, waitMs: MIN_SYNC_GAP_MS - 4000, backingOff: false });
    expect(planSend(saved, 25_000)).toEqual({ send: true });
  });
  it('still keeps the 15 second gap once a back-off has passed', () => {
    const state = { ...afterSaved(initialSyncState(), 10_000), notBefore: 12_000 };
    expect(planSend(state, 12_500)).toEqual({ send: false, waitMs: 12_500, backingOff: false });
  });
});

describe('in-flight guard', () => {
  it('lets one send go, and marks a second as dirty instead', () => {
    const first = beginSend(initialSyncState());
    expect(first.go).toBe(true);
    const second = beginSend(first.state);
    expect(second.go).toBe(false);
    expect(second.state.dirty).toBe(true);
  });
  it('plans again after a save if something changed meanwhile', () => {
    const busy = beginSend(beginSend(initialSyncState()).state).state;
    const done = nextSyncAction('saved', busy, 9000, undefined, () => 0.5);
    expect(done.action).toEqual({ kind: 'replan' });
    expect(done.state).toMatchObject({ inFlight: false, dirty: false, lastSavedAt: 9000 });
  });
  it('does nothing after a clean save or a refusal', () => {
    const busy = beginSend(initialSyncState()).state;
    expect(nextSyncAction('saved', busy, 1, undefined, () => 0.5).action).toEqual({ kind: 'none' });
    const refused = nextSyncAction('refused', busy, 1, undefined, () => 0.5);
    expect(refused.action).toEqual({ kind: 'none' });
    expect(refused.state.inFlight).toBe(false);
  });
  it('schedules a retry after a failure, honouring Retry-After, and frees the flag', () => {
    const busy = beginSend(beginSend(initialSyncState()).state).state;
    const out = nextSyncAction('retry', busy, 0, 30, () => 0);
    expect(out.action).toEqual({ kind: 'retry', delayMs: 30_000 });
    expect(out.state).toMatchObject({ inFlight: false, dirty: false, notBefore: 30_000 });
  });
});
