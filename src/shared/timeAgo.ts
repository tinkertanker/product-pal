/** "just now", "2 min ago", "3 h ago", "2 d ago". Pure: pass the current time in. */
export function timeAgo(now: number, then: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** For the facilitator: how long after joining someone started typing. Pure: epoch ms in, a sentence out. */
export function startedTyping(meta: { joinedAt: number; firstInputAt: number }): string {
  if (meta.firstInputAt <= 0) return 'Not started';
  if (meta.joinedAt <= 0 || meta.firstInputAt < meta.joinedAt) return 'Started typing';
  const minutes = Math.round((meta.firstInputAt - meta.joinedAt) / 60_000);
  return minutes < 1 ? 'Started typing within a minute' : `Started typing after ${minutes} min`;
}
