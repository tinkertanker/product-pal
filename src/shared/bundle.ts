// The files a coding agent gets after the brief is written. Pure: no IO.

import { agentFileContent } from './agentFile';
import type { Canvas } from './canvas';
import { DEFAULT_STACK, designFile } from './design';

export type BundleFile = { name: string; content: string };

export const BUNDLE_NAMES = ['CLAUDE.md', 'AGENTS.md', 'PRODUCT_BRIEF.md', 'DESIGN.md'] as const;

const FILE_ORDER = `When files disagree, follow this order:
1. AGENTS.md (this file)
2. PRODUCT_BRIEF.md
3. DESIGN.md`;

/** Pull the Not building bullets as written. Never split a line on commas. */
export function notBuildingItems(document: string): string[] {
  const match = document.match(/## Not building\s*\n([\s\S]*?)(?=\n## |\s*$)/);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter((line) => line.length > 0);
}

export function agentsFile(canvas: Canvas): string {
  const items = notBuildingItems(canvas.brief.document);
  const listed =
    items.length > 0
      ? items.map((item) => `- ${item}`).join('\n')
      : '- (none listed yet; check PRODUCT_BRIEF.md)';
  return `# Working rules

Think before you code. Restate the story you are about to build in one sentence. If the brief does not settle a choice, ask.

Keep it simple. Prefer the stack in DESIGN.md. Do not add a frontend build or extra services unless the brief cannot work without them.

Make surgical changes. Do not refactor, rename or restyle files you were not asked to touch.

Verify. Run the smallest check that proves the story works before you stop.

## File order

${FILE_ORDER}

## Not building

Never build anything listed under Not building in PRODUCT_BRIEF.md. Copy those lines as they are. Do not split a line on commas into extra rules.

The current list, copied as written:

${listed}

## Deviations

If you break a rule above, add a short note here saying what you did and why.

- (none yet)
`;
}

export function claudeFile(): string {
  return `# Build this product

Read these files, then build in three passes. Do not replace this file or AGENTS.md with a longer template.

- \`AGENTS.md\`: rules. Follow it when anything else disagrees.
- \`PRODUCT_BRIEF.md\`: what to build and what not to.
- \`DESIGN.md\`: stack and look.

## Passes

1. **Core.** Story 1 from First version, enough to walk through the happy path.
2. **Use it.** The unhappy path, then the pass mark for the riskiest bet.
3. **Polish.** DESIGN.md only after the core can be used.

Ask before guessing at an open question. Log a deviation in AGENTS.md if you cannot follow a rule.
`;
}

export function bundleFiles(canvas: Canvas): BundleFile[] {
  return [
    { name: 'CLAUDE.md', content: claudeFile() },
    { name: 'AGENTS.md', content: agentsFile(canvas) },
    { name: 'PRODUCT_BRIEF.md', content: agentFileContent(canvas) },
    { name: 'DESIGN.md', content: designFile(canvas.design) },
  ];
}

/** One paste for a build tool that has no folder yet. */
export function copyAllPrompt(canvas: Canvas): string {
  const files = bundleFiles(canvas);
  const parts = [
    'Here are the project files. Create each one, then follow CLAUDE.md.',
    '',
    ...files.flatMap((file) => [`## ${file.name}`, '', file.content.trimEnd(), '']),
  ];
  return parts.join('\n').trimEnd() + '\n';
}

export function bundleZipName(): string {
  return 'product-pal-bundle.zip';
}

export { DEFAULT_STACK };
