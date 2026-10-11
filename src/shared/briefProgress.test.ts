import { describe, expect, it } from 'vitest';
import { BRIEF_CHECK_STATUS, briefWriteStatus } from './briefProgress';

describe('briefWriteStatus', () => {
  it('moves through three stages and never uses an em dash', () => {
    expect(BRIEF_CHECK_STATUS).toBe('Checking your walkthrough…');
    expect(briefWriteStatus(0)).toBe('Reading your notes…');
    expect(briefWriteStatus(3999)).toBe('Reading your notes…');
    expect(briefWriteStatus(4000)).toBe('Drafting the brief…');
    expect(briefWriteStatus(10000)).toBe('Still writing. This can take a little while…');
    expect(briefWriteStatus(20000)).not.toContain('\u2014');
  });
});
