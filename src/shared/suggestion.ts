// The coach puts a rewritten draft in a ```suggestion fenced block. Pull it out.

export type ParsedCoachText = {
  /** The reply with the suggestion block removed. */
  body: string;
  /** The suggestion, or null if there is none (yet). */
  suggestion: string | null;
  /** True while a suggestion block has opened but not closed (still streaming). */
  pending: boolean;
};

// Models sometimes put the word on the line after the fence, so allow either.
const COMPLETE = /(`{3,})[ \t]*\n?[ \t]*suggestion[^\n]*\n([\s\S]*?)\n?[ \t]*\1[ \t]*(?:\n|$)/i;
const OPEN_ONLY = /`{3,}[ \t]*\n?[ \t]*suggestion[^\n]*(?:\n[\s\S]*)?$/i;
/** A fence at the very end that might still turn into "suggestion". */
const TAIL_FENCE = /(?:^|\n)[ \t]*`{3,}[ \t\n]*([a-z]*)$/i;

export function parseSuggestion(text: string): ParsedCoachText {
  const complete = COMPLETE.exec(text);
  if (complete) {
    const suggestion = (complete[2] ?? '').trim();
    const body = (text.slice(0, complete.index) + text.slice(complete.index + complete[0].length)).trim();
    return { body, suggestion: suggestion || null, pending: false };
  }
  const open = OPEN_ONLY.exec(text);
  if (open) {
    return { body: text.slice(0, open.index).trim(), suggestion: null, pending: true };
  }
  const tail = TAIL_FENCE.exec(text);
  if (tail && 'suggestion'.startsWith((tail[1] ?? '').toLowerCase())) {
    // Only an opening fence counts: an even number of fences came before it.
    const before = text.slice(0, tail.index);
    const fences = before.match(/(?:^|\n)[ \t]*`{3,}/g) ?? [];
    if (fences.length % 2 === 0) return { body: before.trim(), suggestion: null, pending: true };
  }
  return { body: text.trim(), suggestion: null, pending: false };
}
