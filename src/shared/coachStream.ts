// How a coach reply travels from the Worker to the browser. Pure string handling.
//
// The body is the reply text, then END_MARK and one word saying how it ended.
// A failure before any text arrives is a JSON error with a non-200 status
// instead, so this only covers a reply that has started.

/** ASCII record separator. Stripped from model text, so it only ever marks the end. */
export const END_MARK = '\u001e';

/** ok: finished. truncated: hit the token limit. failed: broke off partway. */
export type StreamEnd = 'ok' | 'truncated' | 'failed';

export const endMarker = (end: StreamEnd): string => `${END_MARK}${end}`;

/** Remove any END_MARK the model itself produced. */
export const cleanChunk = (text: string): string => text.split(END_MARK).join('');

/**
 * Split what has arrived into the reply text and how it ended. Only trust
 * `end` once the stream is over: null then means the connection was cut.
 */
export function readCoachStream(raw: string): { text: string; end: StreamEnd | null } {
  const at = raw.indexOf(END_MARK);
  if (at === -1) return { text: raw, end: null };
  const word = raw.slice(at + END_MARK.length);
  return { text: raw.slice(0, at), end: word === 'ok' || word === 'truncated' ? word : 'failed' };
}
