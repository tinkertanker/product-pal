import { useEffect, useRef } from 'react';
import { beaconSync, postSync } from '../api';
import type { Canvas, StepId } from '../shared/canvas';
import { buildSyncRequest, serialiseSync } from '../shared/syncBody';
import { getClientId } from '../storage';

const DEBOUNCE_MS = 4000;
/** After a failed sync, wait this long before trying again; doubles each time up to the cap. */
const RETRY_FIRST_MS = 15_000;
const RETRY_MAX_MS = 120_000;

/**
 * Quietly tell the server how far this participant has got, so a facilitator
 * can see it. Sends 4 seconds after the last change, and once more when the
 * tab is hidden. Nothing here can get in the participant's way.
 */
export function useSync(code: string, canvas: Canvas, done: StepId[]): void {
  const latest = useRef({ code, canvas, done });
  latest.current = { code, canvas, done };
  const lastSent = useRef('');
  const retry = useRef<{ timer: number | undefined; delay: number }>({ timer: undefined, delay: RETRY_FIRST_MS });
  const doneKey = done.join(',');

  // Send the latest state. If the server or network lets us down, forget that we
  // sent it and try again later, so a short outage does not leave the
  // facilitator looking at stale progress until the participant next types.
  const send = useRef(async () => {
    window.clearTimeout(retry.current.timer);
    retry.current.timer = undefined;
    const json = prepare(latest.current, lastSent);
    if (!json) return;
    const outcome = await postSync(json);
    if (outcome === 'saved') {
      retry.current.delay = RETRY_FIRST_MS;
      return;
    }
    if (outcome !== 'retry') return;
    if (lastSent.current === json) lastSent.current = '';
    if (retry.current.timer !== undefined) return;
    const delay = retry.current.delay;
    retry.current.delay = Math.min(delay * 2, RETRY_MAX_MS);
    retry.current.timer = window.setTimeout(() => void send.current(), delay);
  });

  useEffect(() => {
    const timer = window.setTimeout(() => void send.current(), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [code, canvas, doneKey]);

  useEffect(() => {
    const pending = retry.current;
    return () => window.clearTimeout(pending.timer);
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
