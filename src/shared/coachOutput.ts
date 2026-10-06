// Parsing the two coach replies that have a fixed shape. Pure string handling,
// shared by the Worker (tests, prompts) and the browser (streaming display).

const FENCE = '```';

export type ParsedFit = {
  /** Pal's view on whether the parked idea still fits. Null when the reply has no fit block. */
  fit: string | null;
  /** Everything after the fit block: the brief itself. */
  rest: string;
};

/**
 * A brief reply may open with a fenced block labelled "fit", then the document.
 * Safe to call on a half-streamed reply: while the block is still arriving,
 * `fit` holds what has come so far and `rest` is empty, so the block's text
 * never flashes up inside the document.
 */
export function parseFit(raw: string): ParsedFit {
  const text = raw.replace(/^\s+/, '');
  const opener = `${FENCE}fit`;
  if (!text.startsWith(FENCE)) {
    // Not enough yet to know whether a fit block is coming.
    if (text.length < opener.length && opener.startsWith(text)) return { fit: null, rest: '' };
    return { fit: null, rest: text };
  }
  if (!text.startsWith(opener)) {
    if (text.length < opener.length && opener.startsWith(text)) return { fit: null, rest: '' };
    return { fit: null, rest: text };
  }
  // Normally the text starts on the line after the opener. If the model put it
  // on the same line, keep it rather than throwing it away with the opener.
  const afterOpener = text.slice(opener.length);
  const body = afterOpener.replace(/^[ \t]*\n?/, '');
  const close = body.indexOf(FENCE);
  if (close === -1) return { fit: body.replace(/`+$/, '').trim(), rest: '' };
  return { fit: body.slice(0, close).trim(), rest: body.slice(close + FENCE.length).replace(/^\s+/, '') };
}

/**
 * The assumptions reply is three lines, each starting with a dash. Tolerates
 * numbered lists and bullets, and a last line that is still streaming in.
 */
export function parseAssumptions(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^([-*•]|\d+[.)])\s+/.test(line))
    .map((line) => line.replace(/^([-*•]|\d+[.)])\s+/, '').replace(/^\*\*(.*)\*\*$/, '$1').trim())
    .filter((line) => line.length > 0)
    .slice(0, 3);
}
