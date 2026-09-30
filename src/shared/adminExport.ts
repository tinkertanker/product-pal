// Put every participant's canvas into one markdown file. Pure: no IO.

import { canvasToMarkdown, type Canvas } from './canvas';

export type ExportEntry = { nickname: string; canvas: Canvas };

/** One document, with each participant's nickname as the top heading. */
export function allParticipantsMarkdown(entries: readonly ExportEntry[]): string {
  if (entries.length === 0) return '# Product Pal participants\n\nNobody has joined yet.\n';
  return (
    entries
      .map(({ nickname, canvas }) => `# ${nickname}\n\n${canvasToMarkdown(canvas).replace(/^# Product canvas\n+/, '')}`)
      .join('\n---\n\n')
      .trimEnd() + '\n'
  );
}
