// The only file that touches localStorage. Every access is wrapped: storage
// can be blocked or full, and the app should still work without it.

import { parsePublicSettings } from './api';
import type { PublicSettings } from './shared/contracts';
import { emptyCanvas, normaliseCanvas, STEP_IDS, type Canvas, type StepId } from './shared/canvas';
import { ARTIFACT_LIMIT, newSession, readArtifact, type Session } from './shared/session';

const CODE_KEY = 'pt.code';
const CLIENT_KEY = 'pt.clientId';
const STATE_KEY = 'pt.state.v1';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: carry on without saving */
  }
}
function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const loadCode = (): string => read(CODE_KEY) ?? '';
export const saveCode = (code: string): void => write(CODE_KEY, code);
export const clearCode = (): void => remove(CODE_KEY);

let memoryClientId = '';
export function getClientId(): string {
  const stored = read(CLIENT_KEY);
  if (stored) return stored;
  const id = memoryClientId || (globalThis.crypto?.randomUUID?.() ?? `c-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
  memoryClientId = id;
  write(CLIENT_KEY, id);
  return id;
}

/** A coach nudge, kept with the fingerprint of the judgement it answers so a reload does not lose it. */
export type SavedNudge = { fingerprint: string; text: string };

export type SavedState = {
  canvas: Canvas;
  nudges: Partial<Record<StepId, SavedNudge>>;
  step: number;
  session: Session;
};

/** Read a saved state from untrusted text (pure; `loadState` supplies the text). */
export function parseSavedState(raw: string | null): SavedState {
  const fallback: SavedState = { canvas: emptyCanvas(), nudges: {}, step: 0, session: newSession() };
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    // Saves from the first version kept a "challenge" per old step id. Those are dropped: only `nudges` is read.
    const nudges: SavedState['nudges'] = {};
    const n = (typeof data.nudges === 'object' && data.nudges !== null ? data.nudges : {}) as Record<string, unknown>;
    for (const id of STEP_IDS) {
      const v = n[id] as Partial<SavedNudge> | undefined;
      if (v && typeof v.fingerprint === 'string' && typeof v.text === 'string' && v.text.length > 0) nudges[id] = { fingerprint: v.fingerprint, text: v.text };
    }
    // An old save can be on step 5 or 6 of seven; keep the position inside the five screens.
    const saved = typeof data.step === 'number' && Number.isFinite(data.step) ? Math.floor(data.step) : 0;
    const step = Math.min(Math.max(saved, 0), STEP_IDS.length - 1);
    const rawSession = data.session as Partial<Session> | undefined;
    const session = rawSession && typeof rawSession.id === 'string' && rawSession.id.length > 0 && rawSession.id.length <= 100
      ? { id: rawSession.id, artifacts: Array.isArray(rawSession.artifacts) ? rawSession.artifacts.map(readArtifact).filter((a) => a !== undefined).slice(-ARTIFACT_LIMIT) : [] }
      : fallback.session;
    return { canvas: normaliseCanvas(data.canvas), nudges, step, session };
  } catch {
    return fallback;
  }
}

export const loadState = (): SavedState => parseSavedState(read(STATE_KEY));

export const saveState = (state: SavedState): void => write(STATE_KEY, JSON.stringify(state));
export const clearState = (): void => remove(STATE_KEY);

// ---------------------------------------------------------------------------
// Facilitator settings, cached so the first paint matches the last visit.
// ---------------------------------------------------------------------------

const SETTINGS_KEY = 'pt.settings.v1';

export function loadSettings(): PublicSettings | null {
  const raw = read(SETTINGS_KEY);
  if (!raw) return null;
  try {
    return parsePublicSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}
export const saveSettings = (settings: PublicSettings): void => write(SETTINGS_KEY, JSON.stringify(settings));

// ---------------------------------------------------------------------------
// The facilitator's password lives for this tab only.
// ---------------------------------------------------------------------------

const ADMIN_KEY = 'pt.admin';

export function loadAdminPassword(): string {
  try {
    return sessionStorage.getItem(ADMIN_KEY) ?? '';
  } catch {
    return '';
  }
}
export function saveAdminPassword(password: string): void {
  try {
    sessionStorage.setItem(ADMIN_KEY, password);
  } catch {
    /* carry on: they will be asked again after a reload */
  }
}
export function clearAdminPassword(): void {
  try {
    sessionStorage.removeItem(ADMIN_KEY);
  } catch {
    /* ignore */
  }
}
