// Staged copy shown while Pal writes the brief. Pure: elapsed ms in, line out.

export const BRIEF_CHECK_STATUS = 'Checking your walkthrough…';

export function briefWriteStatus(elapsedMs: number): string {
  if (elapsedMs < 4000) return 'Reading your notes…';
  if (elapsedMs < 10000) return 'Drafting the brief…';
  return 'Still writing. This can take a little while…';
}
