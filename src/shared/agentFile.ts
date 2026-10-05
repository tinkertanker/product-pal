// The product brief as a file a coding agent reads on its own. Pure: no IO.

import type { Canvas, Platform } from './canvas';

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

export const WORKING_RULES =
  'Build story 1 first, then stop so I can try it. Plan before you code, commit in small steps, and test the core logic. If a task needs something this file doesn\'t settle, ask before guessing. When a decision changes, update the brief below in the same commit, and move answered open questions into the section they settle. Never build anything listed under "Not building" without asking.';

export const WORKING_RULES_LOVABLE =
  'Build story 1 first and keep to the screens in the walkthrough. Use sample data. Ask before adding anything listed under \'Not building\'.';

/** The rules the agent follows, for the tool the participant picked. */
export function workingRules(platform: Platform): string {
  return platform === 'lovable' ? WORKING_RULES_LOVABLE : WORKING_RULES;
}

/** A short block of working rules, then the brief. Ends with one newline. */
export function agentFileContent(canvas: Canvas): string {
  return `# Working rules\n${workingRules(canvas.brief.platform)}\n\n${canvas.brief.document.trim()}\n`;
}
