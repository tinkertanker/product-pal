import { describe, expect, it } from 'vitest';
import { DEFAULT_STACK, designFile, emptyDesign, hasLookChoices } from './design';

describe('designFile', () => {
  it('always includes the class stack and a look fallback when they skipped', () => {
    const md = designFile(emptyDesign());
    expect(md).toContain('## Stack');
    expect(md).toContain(DEFAULT_STACK);
    expect(md).toContain('The builder may choose a simple, readable look');
    expect(md).not.toContain('\u2014');
  });
  it('names the chosen look in words, not ids', () => {
    const md = designFile({ palette: 'indigo', font: 'serif', direction: 'minimal', stack: 'Python only.' });
    expect(md).toContain('Palette: Indigo and white');
    expect(md).toContain('Font: Serif');
    expect(md).toContain('Direction: Minimal, function first');
    expect(md).toContain('Python only.');
    expect(md).not.toContain('indigo');
  });
});

describe('hasLookChoices', () => {
  it('ignores the default stack', () => {
    expect(hasLookChoices(emptyDesign())).toBe(false);
    expect(hasLookChoices({ ...emptyDesign(), palette: 'warm' })).toBe(true);
  });
});
