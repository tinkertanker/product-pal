// The only file that touches localStorage. Every access is wrapped: storage
// can be blocked or full, and the app should still work without it.

import { parsePublicSettings } from './api';
import type { PublicSettings } from './shared/contracts';
import { emptyCanvas, normaliseCanvas, STEP_IDS, type Canvas, type StepId } from './shared/canvas';

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

export type SavedState = {
  canvas: Canvas;
  /** The coach's latest challenge for each step, so a reload does not lose it. */
  challenges: Partial<Record<StepId, string>>;
  step: number;
};

export function loadState(): SavedState {
  const fallback: SavedState = { canvas: emptyCanvas(), challenges: {}, step: 0 };
  const raw = read(STATE_KEY);
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    const challenges: SavedState['challenges'] = {};
    const c = (typeof data.challenges === 'object' && data.challenges !== null ? data.challenges : {}) as Record<string, unknown>;
    for (const id of STEP_IDS) if (typeof c[id] === 'string') challenges[id] = c[id] as string;
    const step = typeof data.step === 'number' && data.step >= 0 && data.step < STEP_IDS.length ? Math.floor(data.step) : 0;
    return { canvas: normaliseCanvas(data.canvas), challenges, step };
  } catch {
    return fallback;
  }
}

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
