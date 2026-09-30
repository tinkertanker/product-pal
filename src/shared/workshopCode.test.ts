import { describe, expect, it } from 'vitest';
import { codeMatches, parseCodes } from './workshopCode';

describe('parseCodes', () => {
  it('splits, trims and upper-cases', () => {
    expect(parseCodes(' m82t7 , abc12,,')).toEqual(['M82T7', 'ABC12']);
  });
  it('returns nothing for an empty or missing env', () => {
    expect(parseCodes('')).toEqual([]);
    expect(parseCodes(undefined)).toEqual([]);
    expect(parseCodes(' , ')).toEqual([]);
  });
});

describe('codeMatches', () => {
  const codes = parseCodes('M82T7,SECOND');
  it('ignores case and surrounding whitespace', () => {
    expect(codeMatches('m82t7', codes)).toBe(true);
    expect(codeMatches('  M82T7\n', codes)).toBe(true);
    expect(codeMatches('second', codes)).toBe(true);
  });
  it('rejects wrong, empty and non-string input', () => {
    expect(codeMatches('WRONG', codes)).toBe(false);
    expect(codeMatches('', codes)).toBe(false);
    expect(codeMatches('   ', codes)).toBe(false);
    expect(codeMatches(undefined, codes)).toBe(false);
    expect(codeMatches(12345, codes)).toBe(false);
  });
  it('lets nobody in when no codes are configured', () => {
    expect(codeMatches('anything', [])).toBe(false);
    expect(codeMatches('', [])).toBe(false);
  });
});
