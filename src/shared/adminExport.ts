// Put every participant's canvas into one markdown file. Pure: no IO.

import { canvasToMarkdown, type Canvas } from './canvas';

export type ExportEntry = { nickname: string; canvas: Canvas };

/** Push every heading down one level (outside code fences), so a nickname can be the top heading. */
export function demoteHeadings(markdown: string): string {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      return !inFence && /^#{1,5}\s/.test(line) ? `#${line}` : line;
    })
    .join('\n');
}

/** One document, with each participant's nickname as the top heading. */
export function allParticipantsMarkdown(entries: readonly ExportEntry[]): string {
  if (entries.length === 0) return '# Product Pal participants\n\nNobody has joined yet.\n';
  return (
    entries
      .map(({ nickname, canvas }) => `# ${nickname}\n\n${demoteHeadings(canvasToMarkdown(canvas))}`)
      .join('\n---\n\n')
      .trimEnd() + '\n'
  );
}
