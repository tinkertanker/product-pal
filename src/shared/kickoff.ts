// The first message to send a coding agent once it has the brief. Pure: no IO.

import type { Canvas } from './canvas';
import { agentFileName, workingRules } from './agentFile';

const ASK =
  'Ask me its open questions, and anything else you would otherwise guess, in one round of up to three questions, each with your recommended answer.';

/**
 * The kick-off message. It asks for one round of questions with recommended
 * answers, rather than putting a "grill me before every task" rule inside the
 * brief. For Lovable, which has no file to read, it is meant to be pasted
 * after the brief.
 */
export function kickoffMessage(canvas: Canvas): string {
  if (canvas.brief.platform === 'lovable') {
    return `Ask me the brief's open questions, and anything else you would otherwise guess, in one round of up to three questions, each with your recommended answer. Update the brief with my answers. Then propose a plan for story 1 and wait for my go-ahead.\n\nWhen I approve the plan: ${workingRules(canvas.brief.platform)}`;
  }
  const file = agentFileName(canvas.brief.platform);
  return `Read ${file}. ${ASK} Write my answers into the file. Then propose a plan for story 1 and wait for my go-ahead.\n\nWhen I approve the plan: ${workingRules(canvas.brief.platform)}`;
}
