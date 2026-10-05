// Turn the canvas into the body of POST /api/sync. Pure: no IO.

import { STEP_IDS, type Canvas, type StepId } from './canvas';
import type { SyncRequest } from './contracts';
import { canvasForRequest, clampMessages } from './validation';

/** The server rejects bodies over 200 KB; stay comfortably under. */
export const SYNC_MAX_BYTES = 190_000;

export function buildSyncRequest(input: { code: string; clientId: string; canvas: Canvas; done: StepId[] }): SyncRequest {
  const base = canvasForRequest(input.canvas);
  const chats = { ...base.chats };
  for (const id of STEP_IDS) chats[id] = clampMessages(input.canvas.chats[id] ?? []);
  return {
    code: input.code,
    clientId: input.clientId,
    canvas: { ...base, chats, judgements: input.canvas.judgements, meta: input.canvas.meta },
    done: input.done,
  };
}

export type SerialisedSync = { ok: true; json: string } | { ok: false; bytes: number };

const byteLength = (text: string) => new TextEncoder().encode(text).length;

export function serialiseSync(request: SyncRequest): SerialisedSync {
  const json = JSON.stringify(request);
  const bytes = byteLength(json);
  return bytes > SYNC_MAX_BYTES ? { ok: false, bytes } : { ok: true, json };
}
