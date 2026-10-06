// Pure rules for the facilitator side: the password check, and turning a
// participant's sync into a stored row and a stored row into a summary.

import { normaliseCanvas, normaliseDone, type Canvas, type StepId } from './canvas';
import { nicknameFor, type ParticipantSummary, type SyncRequest } from './contracts';

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

/**
 * Compare two strings without stopping at the first difference. The loop runs
 * for the longer of the two, so timing says nothing about where they differ.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export type AdminAuth = 'ok' | 'unconfigured' | 'unauthorised';

/** Check an `Authorization: Bearer <password>` header against the configured password. */
export function checkAdminAuth(header: string | null | undefined, password: string | undefined): AdminAuth {
  const expected = password?.trim() ?? '';
  if (expected.length === 0) return 'unconfigured';
  const match = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? '');
  if (!match || !match[1]) return 'unauthorised';
  return constantTimeEqual(match[1].trim(), expected) ? 'ok' : 'unauthorised';
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** One row of the `participants` table, as D1 returns it. */
export type ParticipantRow = {
  client_id: string;
  nickname: string;
  canvas: string;
  done: string;
  build_prompt_length: number;
  created_at: number;
  updated_at: number;
};

/** The columns a sync writes. `created_at` only matters for a first insert. */
export type SyncRow = Omit<ParticipantRow, 'created_at' | 'updated_at'> & { now: number };

export function syncRowFrom(request: SyncRequest, now: number): SyncRow {
  return {
    client_id: request.clientId,
    nickname: nicknameFor(request.clientId),
    canvas: JSON.stringify(request.canvas),
    done: JSON.stringify(request.done),
    /** The column keeps its old name; it now holds the length of the brief. */
    build_prompt_length: request.canvas.brief.document.trim().length,
    now,
  };
}

function parseDone(text: string): StepId[] {
  try {
    // Old rows hold the first version's step ids; normaliseDone maps them.
    return normaliseDone(JSON.parse(text));
  } catch {
    return [];
  }
}

export function rowToSummary(row: Omit<ParticipantRow, 'canvas'>): ParticipantSummary {
  return {
    clientId: row.client_id,
    nickname: row.nickname,
    done: parseDone(row.done),
    buildPromptLength: Number(row.build_prompt_length) || 0,
    updatedAt: Number(row.updated_at) || 0,
    createdAt: Number(row.created_at) || 0,
  };
}

/** The stored canvas, made well-formed again (an old or damaged row never breaks the dashboard). */
export function canvasFromRow(text: string): Canvas {
  try {
    return normaliseCanvas(JSON.parse(text));
  } catch {
    return normaliseCanvas(null);
  }
}
