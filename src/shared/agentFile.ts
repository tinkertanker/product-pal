// The product brief as a file a coding agent reads on its own. Pure: no IO.

import type { Canvas, Platform } from './canvas';

/** A project document, never an agent's persistent instructions file. */
export function agentFileName(_platform: Platform): string {
  return 'PRODUCT_BRIEF.md';
}

export const WORKING_RULES =
  'Build story 1 first, then stop so I can try it. Plan before you code, commit in small steps, and test the core logic. If a task needs something the brief doesn\'t settle, ask before guessing. When a decision changes, update the brief in the same commit, and move answered open questions into the section they settle. Never build anything listed under "Not building" without asking.';

export const WORKING_RULES_LOVABLE =
  'Build story 1 first and keep to the screens in the walkthrough. Use sample data. Ask before adding anything listed under \'Not building\'.';

/** The rules the agent follows, for the tool the participant picked. */
export function workingRules(platform: Platform): string {
  return platform === 'lovable' ? WORKING_RULES_LOVABLE : WORKING_RULES;
}

/** The brief only. Working instructions belong in the kick-off message. */
export function agentFileContent(canvas: Canvas): string {
  return `${canvas.brief.document.trim()}\n`;
}
