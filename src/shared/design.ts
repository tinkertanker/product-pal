// Optional look-and-stack choices. Not a sixth coaching step. Pure: no IO.

export const DEFAULT_STACK =
  'Python + Flask with HTML templates. One process, no frontend build, so a class can run story 1 from a single folder.';

export const DESIGN_LANDS = 'DESIGN.md';

export type Design = { palette: string; font: string; direction: string; stack: string };

export type DesignChoice = { id: string; label: string; hint?: string };

export const PALETTE_OPTIONS: readonly DesignChoice[] = [
  { id: 'indigo', label: 'Indigo and white', hint: 'Clean SaaS, one strong blue' },
  { id: 'warm', label: 'Warm cream and coral', hint: 'Friendly, paper-like' },
  { id: 'studio', label: 'Dark studio', hint: 'High contrast, fewer colours' },
  { id: 'guess', label: 'You pick for me' },
];

export const FONT_OPTIONS: readonly DesignChoice[] = [
  { id: 'sans', label: 'System sans', hint: 'Inter or the system UI font' },
  { id: 'serif', label: 'Serif', hint: 'Editorial, a bit more character' },
  { id: 'mono', label: 'Monospace', hint: 'Utilitarian, code-like' },
];

export const DIRECTION_OPTIONS: readonly DesignChoice[] = [
  { id: 'editorial', label: 'Bold and editorial' },
  { id: 'friendly', label: 'Calm, warm and friendly' },
  { id: 'minimal', label: 'Minimal, function first' },
  { id: 'guess', label: 'You pick, best guess for me' },
];

export function emptyDesign(): Design {
  return { palette: '', font: '', direction: '', stack: DEFAULT_STACK };
}

export function choiceLabel(options: readonly DesignChoice[], id: string): string {
  return options.find((o) => o.id === id)?.label ?? '';
}

export function hasLookChoices(design: Design): boolean {
  return ['palette', 'font', 'direction'].some((key) => design[key as 'palette' | 'font' | 'direction'].replace(/\s+/g, '').length > 0);
}

/** DESIGN.md. Always includes the stack. Look lines stay out when they skipped the card. */
export function designFile(design: Design): string {
  const lines = ['# Design', '', '## Stack', '', design.stack.trim() || DEFAULT_STACK, ''];
  const palette = choiceLabel(PALETTE_OPTIONS, design.palette);
  const font = choiceLabel(FONT_OPTIONS, design.font);
  const direction = choiceLabel(DIRECTION_OPTIONS, design.direction);
  if (palette || font || direction) {
    lines.push('## Look', '');
    if (palette) lines.push(`- Palette: ${palette}`);
    if (font) lines.push(`- Font: ${font}`);
    if (direction) lines.push(`- Direction: ${direction}`);
    lines.push('');
  } else {
    lines.push('## Look', '', 'The builder may choose a simple, readable look that fits the stack.', '');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
