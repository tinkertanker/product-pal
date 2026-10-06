import { useEffect, useRef } from 'react';
import { beaconSync, postSync } from '../api';
import type { Canvas, StepId } from '../shared/canvas';
import { buildSyncRequest, serialiseSync } from '../shared/syncBody';
import { DEBOUNCE_MS, beginSend, initialSyncState, nextSyncAction, planSend } from '../shared/syncPolicy';
import { getClientId } from '../storage';

/**
 * Quietly tell the server how far this participant has got, so a facilitator
 * can see it. The policy (debounce, back-off, one sync per 15 seconds) lives in
 * src/shared/syncPolicy.ts. A send happens 4 seconds after the last change,
 * unless we are backing off or synced recently, in which case the one
 * scheduled send carries the latest state. The tab being hidden sends at once.
 * Nothing here can get in the participant's way.
 */
export function useSync(code: string, canvas: Canvas, done: StepId[]): void {
  const latest = useRef({ code, canvas, done });
  latest.current = { code, canvas, done };
  const lastSent = useRef('');
  const policy = useRef(initialSyncState());
  const scheduled = useRef<number | undefined>(undefined);
  const doneKey = done.join(',');

  const schedule = useRef((ms: number) => {
    if (scheduled.current !== undefined) return;
    scheduled.current = window.setTimeout(() => {
      scheduled.current = undefined;
      void send.current();
    }, ms);
  });

  // Send the latest state. If the server or network lets us down, forget that we
  // sent it and schedule a retry, so a short outage does not leave the
  // facilitator looking at stale progress until the participant next types.
  const send = useRef(async () => {
    const begun = beginSend(policy.current);
    policy.current = begun.state;
    if (!begun.go) return;
    const json = prepare(latest.current, lastSent);
    if (!json) {
      policy.current = { ...policy.current, inFlight: false, dirty: false };
      return;
    }
    const result = await postSync(json);
    if (result.outcome === 'retry' && lastSent.current === json) lastSent.current = '';
    const next = nextSyncAction(result.outcome, policy.current, Date.now(), result.retryAfterSeconds, Math.random);
    policy.current = next.state;
    if (next.action.kind === 'retry') schedule.current(next.action.delayMs);
    else if (next.action.kind === 'replan') onChange.current();
  });

  // The debounced path. While backing off, or inside the 15 second gap, it does
  // not send: it makes sure one send is scheduled for when it is allowed.
  const onChange = useRef(() => {
    const plan = planSend(policy.current, Date.now());
    if (plan.send) void send.current();
    else schedule.current(plan.waitMs);
  });

  useEffect(() => {
    const timer = window.setTimeout(() => onChange.current(), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [code, canvas, doneKey]);

  useEffect(() => {
    return () => {
      window.clearTimeout(scheduled.current);
      scheduled.current = undefined;
    };
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      const json = prepare(latest.current, lastSent);
      if (json) beaconSync(json);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);
}

/** The body to send, or null if there is nothing new or it is too big. Remembers what it hands out. */
function prepare(state: { code: string; canvas: Canvas; done: StepId[] }, lastSent: { current: string }): string | null {
  const out = serialiseSync(buildSyncRequest({ ...state, clientId: getClientId() }));
  if (!out.ok) {
    console.warn(`Not syncing progress: it is ${out.bytes} bytes, over the limit.`);
    return null;
  }
  if (out.json === lastSent.current) return null;
  lastSent.current = out.json;
  return out.json;
}
