// When the browser may send progress to /api/sync. Pure: the clock and the
// random source come in as arguments, so the policy can be tested exactly.

/** Wait this long after the last change before the first send of a burst. */
export const DEBOUNCE_MS = 4000;
/** After a failed sync, the first wait. It doubles on each further failure. */
export const RETRY_FIRST_MS = 15_000;
export const RETRY_MAX_MS = 120_000;
/** At most one successful sync per browser in this time while typing. The hide path is exempt. */
export const MIN_SYNC_GAP_MS = 15_000;
/** A Retry-After longer than this is not believed. */
export const RETRY_AFTER_MAX_SECONDS = 300;

export type SyncState = {
  /** The wait before the next retry, before jitter. */
  base: number;
  /** No send before this time (ms since the epoch): we are backing off. 0 means not backing off. */
  notBefore: number;
  /** When the last sync was saved. 0 means never. */
  lastSavedAt: number;
  /** A sync is outstanding. */
  inFlight: boolean;
  /** Something asked to send while one was outstanding. */
  dirty: boolean;
};

export const initialSyncState = (): SyncState => ({ base: RETRY_FIRST_MS, notBefore: 0, lastSavedAt: 0, inFlight: false, dirty: false });

/** Read a Retry-After header as whole seconds. Undefined unless it is a sensible number of seconds. */
export function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (!header || !/^\s*\d+\s*$/.test(header)) return undefined;
  const seconds = Number(header);
  return seconds > 0 && seconds <= RETRY_AFTER_MAX_SECONDS ? seconds : undefined;
}

/** Spread a delay over 0.5x to 1.5x, so browsers that failed together do not retry together. */
export function withJitter(delayMs: number, random: () => number): number {
  return Math.round(delayMs * (0.5 + random()));
}

export function afterSaved(state: SyncState, now: number): SyncState {
  return { ...state, base: RETRY_FIRST_MS, notBefore: 0, lastSavedAt: now };
}

/** About to send. Refused (and remembered as dirty) while another send is outstanding. */
export function beginSend(state: SyncState): { state: SyncState; go: boolean } {
  if (state.inFlight) return { state: { ...state, dirty: true }, go: false };
  return { state: { ...state, inFlight: true }, go: true };
}

export type SyncOutcomeKind = 'saved' | 'retry' | 'refused';

/** What to do once a send has finished: nothing, plan again (changes arrived meanwhile), or retry later. */
export type SyncAction = { kind: 'none' } | { kind: 'replan' } | { kind: 'retry'; delayMs: number };

export function nextSyncAction(
  outcome: SyncOutcomeKind,
  state: SyncState,
  now: number,
  retryAfterSeconds: number | undefined,
  random: () => number,
): { state: SyncState; action: SyncAction } {
  const idle = { ...state, inFlight: false, dirty: false };
  if (outcome === 'saved') return { state: afterSaved(idle, now), action: state.dirty ? { kind: 'replan' } : { kind: 'none' } };
  if (outcome === 'refused') return { state: idle, action: { kind: 'none' } };
  // A retry sends the latest state anyway, so a dirty flag needs no second send.
  const next = afterRetryable(idle, now, retryAfterSeconds, random);
  return { state: next.state, action: { kind: 'retry', delayMs: next.delayMs } };
}

/**
 * A sync failed for a passing reason. Back off: the wait is the current base
 * with jitter, or the server's Retry-After (plus a little jitter) if that is
 * longer. The base then doubles up to the cap.
 */
export function afterRetryable(
  state: SyncState,
  now: number,
  retryAfterSeconds: number | undefined,
  random: () => number,
): { state: SyncState; delayMs: number } {
  const jittered = withJitter(state.base, random);
  const asked = retryAfterSeconds === undefined ? 0 : Math.round(retryAfterSeconds * 1000 * (1 + 0.25 * random()));
  const delayMs = Math.max(jittered, asked);
  return {
    delayMs,
    state: { ...state, base: Math.min(state.base * 2, RETRY_MAX_MS), notBefore: now + delayMs },
  };
}

export type SendPlan =
  | { send: true }
  /** Not yet. `backingOff` means a retry is already due, so there is nothing to schedule. */
  | { send: false; waitMs: number; backingOff: boolean };

/** May the debounced path send now? (The hide path does not ask.) */
export function planSend(state: SyncState, now: number): SendPlan {
  if (state.notBefore > now) return { send: false, waitMs: state.notBefore - now, backingOff: true };
  const next = state.lastSavedAt + MIN_SYNC_GAP_MS;
  if (state.lastSavedAt > 0 && next > now) return { send: false, waitMs: next - now, backingOff: false };
  return { send: true };
}
