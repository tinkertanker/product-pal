// A quick, honest checklist for a build prompt. Heuristics, not proof:
// they catch what is plainly missing so the participant knows where to look.

import type { Canvas } from './canvas';

export type CheckItem = { id: string; label: string; pass: boolean };

export const MAX_WORDS = 1200;

const STOP_WORDS = new Set([
  'this', 'that', 'with', 'from', 'they', 'their', 'them', 'have', 'been', 'will', 'would', 'could', 'should',
  'about', 'which', 'when', 'what', 'were', 'your', 'into', 'than', 'then', 'also', 'more', 'most', 'some',
  'such', 'only', 'each', 'other', 'because', 'today', 'need', 'needs',
]);

export function wordCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/** Distinctive lowercase words (4+ letters) from a piece of the canvas. */
export function keywords(text: string): string[] {
  const found = text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [];
  return [...new Set(found.filter((w) => !STOP_WORDS.has(w)))];
}

/** True if enough of the source's keywords show up in the prompt. */
export function mentions(prompt: string, source: string, minimum = 2): boolean {
  const words = keywords(source);
  if (words.length === 0) return false;
  const haystack = prompt.toLowerCase();
  const hits = words.filter((w) => haystack.includes(w)).length;
  return hits >= Math.min(minimum, words.length);
}

export function checkBuildPrompt(prompt: string, canvas: Canvas): CheckItem[] {
  const text = prompt.trim();
  const has = (re: RegExp) => re.test(text);
  const empty = text.length === 0;

  const items: CheckItem[] = [
    {
      id: 'user',
      label: 'Names the user',
      pass: !empty && mentions(text, canvas.idea.who),
    },
    {
      id: 'problem',
      label: 'States the problem',
      pass:
        !empty &&
        has(/\bproblem\b/i) &&
        mentions(text, canvas.problem.statement || canvas.idea.pain),
    },
    {
      id: 'metric',
      label: 'Includes the metric',
      pass: !empty && has(/\b(metric|success|measure)/i) && mentions(text, canvas.metric.primary, 1),
    },
    {
      id: 'scope',
      label: 'Scopes the first version to test the riskiest assumption',
      pass: !empty && has(/\b(first version|smallest|minimum|mvp)\b/i) && has(/\b(assum|riskiest|test|validate|prove)/i),
    },
    {
      id: 'outOfScope',
      label: 'Lists what is out of scope',
      pass: !empty && has(/\b(out of scope|not in scope|non-goals?|won't build|will not build|do not build|don't build|not include)/i),
    },
    {
      id: 'firstTwoMinutes',
      label: 'Describes the first two minutes',
      pass:
        !empty &&
        (has(/\bfirst (two|2) minutes\b/i) || mentions(text, canvas.experience.firstTwoMinutes, 3)),
    },
    {
      id: 'unhappy',
      label: 'Covers the unhappy path',
      pass: !empty && has(/\b(goes wrong|go wrong|unhappy|error|fails?|failure|fallback|edge case)/i),
    },
    {
      id: 'length',
      label: `Under about ${MAX_WORDS.toLocaleString('en-GB')} words`,
      pass: !empty && wordCount(text) <= MAX_WORDS,
    },
  ];
  return items;
}

export function checklistSummary(items: readonly CheckItem[]): { passed: number; total: number } {
  return { passed: items.filter((i) => i.pass).length, total: items.length };
}
