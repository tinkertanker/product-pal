import { describe, expect, it } from 'vitest';
import { parseAssumptions, parseFit } from './coachOutput';

describe('parseFit', () => {
  it('splits a fit block from the brief', () => {
    const raw = '```fit\nYes. The summary tests whether nurses trust it.\n```\n\n# Handover: product brief\n\n**In one line:** …';
    expect(parseFit(raw)).toEqual({
      fit: 'Yes. The summary tests whether nurses trust it.',
      rest: '# Handover: product brief\n\n**In one line:** …',
    });
  });

  it('returns the whole text when there is no fit block', () => {
    expect(parseFit('# Handover: product brief\n\nText')).toEqual({ fit: null, rest: '# Handover: product brief\n\nText' });
  });

  it('holds everything back while the opening fence is still arriving', () => {
    expect(parseFit('`')).toEqual({ fit: null, rest: '' });
    expect(parseFit('```fi')).toEqual({ fit: null, rest: '' });
  });

  it('shows the fit text so far while the block is open, and no document yet', () => {
    expect(parseFit('```fit\nYes. The summ')).toEqual({ fit: 'Yes. The summ', rest: '' });
    expect(parseFit('```fit\nYes, it fits.\n``')).toEqual({ fit: 'Yes, it fits.', rest: '' });
  });

  it('copes with a fit block written on one line', () => {
    expect(parseFit('```fit Yes, it fits.```\n\n# Brief\n\nText')).toEqual({ fit: 'Yes, it fits.', rest: '# Brief\n\nText' });
  });

  it('treats another kind of fenced block as part of the document', () => {
    const raw = '```markdown\n# Title\n```';
    expect(parseFit(raw)).toEqual({ fit: null, rest: raw });
  });
});

describe('parseAssumptions', () => {
  it('reads three dashed lines', () => {
    expect(parseAssumptions('- Nurses will trust it.\n- The notes can be read.\n- It saves enough time.')).toEqual([
      'Nurses will trust it.',
      'The notes can be read.',
      'It saves enough time.',
    ]);
  });

  it('tolerates numbering, extra text and more than three', () => {
    const raw = 'Here are three:\n1. One\n2) Two\n* Three\n- Four';
    expect(parseAssumptions(raw)).toEqual(['One', 'Two', 'Three']);
  });

  it('returns what has arrived so far', () => {
    expect(parseAssumptions('- First one\n- Sec')).toEqual(['First one', 'Sec']);
    expect(parseAssumptions('')).toEqual([]);
  });
});
