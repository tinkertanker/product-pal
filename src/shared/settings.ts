// Facilitator settings: stored as key/value rows, read as typed settings.

import { DEFAULT_SETTINGS, type PublicSettings, type Settings } from './contracts';

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

export type SettingsRow = { key: string; value: string };

/** Stored rows merged over the defaults. Unknown keys and unreadable values are ignored. */
export function settingsFromRows(rows: readonly SettingsRow[]): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (!(SETTING_KEYS as string[]).includes(row.key)) continue;
    if (row.value === 'true') out[row.key as keyof Settings] = true;
    else if (row.value === 'false') out[row.key as keyof Settings] = false;
  }
  return out;
}

/** Rows to write for a patch. */
export function rowsFromPatch(patch: Partial<Settings>): SettingsRow[] {
  return SETTING_KEYS.filter((key) => typeof patch[key] === 'boolean').map((key) => ({ key, value: String(patch[key]) }));
}

export type PatchResult = { ok: true; value: Partial<Settings> } | { ok: false; error: string };

/** A PUT body: an object holding only known settings, each true or false. */
export function readSettingsPatch(body: unknown): PatchResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'Send an object of settings.' };
  const patch: Partial<Settings> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!(SETTING_KEYS as string[]).includes(key)) return { ok: false, error: `${key} is not a setting.` };
    if (typeof value !== 'boolean') return { ok: false, error: `${key} must be true or false.` };
    patch[key as keyof Settings] = value;
  }
  return { ok: true, value: patch };
}

export function toPublicSettings(settings: Settings, judgeAvailable: boolean): PublicSettings {
  return { ...settings, judgeAvailable };
}
