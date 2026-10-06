import { describe, expect, it } from 'vitest';
import { briefedCanvas } from './fixtures';
import { BRIEF_SECTIONS, BRIEF_WORDS, missingSections, wordCount } from './prd';

describe('prd helpers', () => {
  it('lists the eight sections in order', () => {
    expect(BRIEF_SECTIONS).toEqual([
      'Problem',
      'Evidence',
      'Success',
      'Riskiest bet',
      'First version',
      'Walkthrough',
      'Not building',
      'Open questions',
    ]);
    expect(BRIEF_WORDS).toEqual({ min: 350, max: 450 });
  });
  it('counts words', () => {
    expect(wordCount('  one two\nthree  ')).toBe(3);
    expect(wordCount('')).toBe(0);
  });
  it('finds the sections a document lacks', () => {
    expect(missingSections(briefedCanvas().brief.document)).toEqual([]);
    expect(missingSections('# Title\n## Problem\nx\n## evidence\ny')).toEqual([
      'Success',
      'Riskiest bet',
      'First version',
      'Walkthrough',
      'Not building',
      'Open questions',
    ]);
  });
});
