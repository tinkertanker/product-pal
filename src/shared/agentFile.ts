// The build prompt as a file a coding agent reads on its own. Pure: no IO.

import type { Platform } from './canvas';

export const AGENT_FILE_HEADER =
  '# Project brief\n\nThis file was written in Product Pal. Read it before every task, and keep it up to date as decisions change.';

/** The file name each tool looks for. */
export function agentFileName(platform: Platform): string {
  switch (platform) {
    case 'claude-code':
      return 'CLAUDE.md';
    case 'lovable':
      return 'PROJECT.md';
    default:
      return 'AGENTS.md';
  }
}

/** A short header followed by the build prompt. */
export function agentFileContent(prompt: string): string {
  return `${AGENT_FILE_HEADER}\n\n${prompt.trim()}\n`;
}
