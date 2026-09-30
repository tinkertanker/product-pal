// The only code that writes SQL. Thin: each function is one statement.

import { settingsFromRows, rowsFromPatch, type SettingsRow } from '../src/shared/settings';
import type { ParticipantRow, SyncRow } from '../src/shared/admin';
import type { Settings } from '../src/shared/contracts';

export const upsertParticipant = (db: D1Database, row: SyncRow) =>
  db
    .prepare(
      `INSERT INTO participants (client_id, nickname, canvas, done, build_prompt_length, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
       ON CONFLICT(client_id) DO UPDATE SET
         nickname = excluded.nickname,
         canvas = excluded.canvas,
         done = excluded.done,
         build_prompt_length = excluded.build_prompt_length,
         updated_at = excluded.updated_at`,
    )
    .bind(row.client_id, row.nickname, row.canvas, row.done, row.build_prompt_length, row.now)
    .run();

const SUMMARY_COLUMNS = 'client_id, nickname, done, build_prompt_length, created_at, updated_at';
export const MAX_PARTICIPANTS_LISTED = 1000;

export async function listParticipants(db: D1Database): Promise<Omit<ParticipantRow, 'canvas'>[]> {
  const { results } = await db
    .prepare(`SELECT ${SUMMARY_COLUMNS} FROM participants ORDER BY updated_at DESC LIMIT ?1`)
    .bind(MAX_PARTICIPANTS_LISTED)
    .all<Omit<ParticipantRow, 'canvas'>>();
  return results;
}

export const getParticipant = (db: D1Database, clientId: string) =>
  db
    .prepare(`SELECT ${SUMMARY_COLUMNS}, canvas FROM participants WHERE client_id = ?1`)
    .bind(clientId)
    .first<ParticipantRow>();

/** Returns how many rows went. */
export async function clearParticipants(db: D1Database): Promise<number> {
  const result = await db.prepare('DELETE FROM participants').run();
  return result.meta?.changes ?? 0;
}

export async function readSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<SettingsRow>();
  return settingsFromRows(results);
}

export async function writeSettings(db: D1Database, patch: Partial<Settings>): Promise<void> {
  const rows = rowsFromPatch(patch);
  if (rows.length === 0) return;
  await db.batch(
    rows.map((r) =>
      db
        .prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(r.key, r.value),
    ),
  );
}
