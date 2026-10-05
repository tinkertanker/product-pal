// The shape of the product brief (the PRD). One list of sections, shared by
// the coach prompt and by the tests that check what comes back. Pure: no IO.

/** The headings of the brief, in order. The title line and the "In one line" line come before the first. */
export const BRIEF_SECTIONS = [
  'Problem',
  'Evidence',
  'Success',
  'Riskiest bet',
  'First version',
  'Walkthrough',
  'Not building',
  'Open questions',
] as const;

export const BRIEF_WORDS = { min: 350, max: 450 } as const;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** The brief's `##` headings that are missing from a document, in order. Empty when it is complete. */
export function missingSections(document: string): string[] {
  const headings = new Set(
    [...document.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => (m[1] ?? '').toLowerCase()),
  );
  return BRIEF_SECTIONS.filter((section) => !headings.has(section.toLowerCase()));
}
