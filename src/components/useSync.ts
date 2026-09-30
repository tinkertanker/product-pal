import { useEffect, useRef } from 'react';
import { beaconSync, postSync } from '../api';
import type { Canvas, StepId } from '../shared/canvas';
import { buildSyncRequest, serialiseSync } from '../shared/syncBody';
import { getClientId } from '../storage';

const DEBOUNCE_MS = 4000;

/**
 * Quietly tell the server how far this participant has got, so a facilitator
 * can see it. Sends 4 seconds after the last change, and once more when the
 * tab is hidden. Nothing here can get in the participant's way.
 */
export function useSync(code: string, canvas: Canvas, done: StepId[]): void {
  const latest = useRef({ code, canvas, done });
  latest.current = { code, canvas, done };
  const lastSent = useRef('');
  const doneKey = done.join(',');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const json = prepare(latest.current, lastSent);
      if (json) void postSync(json);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [code, canvas, doneKey]);

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
