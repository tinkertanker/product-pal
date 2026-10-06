import { describe, expect, it } from 'vitest';
import { emptyCanvas, setField } from './canvas';
import { filledCanvas } from './fixtures';
import { missingInput } from './readiness';

describe('missingInput', () => {
  it('refuses everything on an empty canvas, with a message free of em dashes', () => {
    const c = emptyCanvas();
    for (const call of [{ kind: 'judge', step: 'who' }, { kind: 'statement' }, { kind: 'assumptions' }, { kind: 'brief' }] as const) {
      const message = missingInput(call, c);
      expect(message).toBeTruthy();
      expect(message).not.toContain('—');
    }
  });
  it('accepts a filled canvas', () => {
    const c = filledCanvas();
    for (const call of [{ kind: 'judge', step: 'bet' }, { kind: 'statement' }, { kind: 'assumptions' }, { kind: 'brief' }] as const) {
      expect(missingInput(call, c)).toBeNull();
    }
  });
  it('judge needs nothing left empty on that step', () => {
    const c = setField(filledCanvas(), 'success', 'today', '   ');
    expect(missingInput({ kind: 'judge', step: 'success' }, c)).not.toBeNull();
    expect(missingInput({ kind: 'judge', step: 'who' }, c)).toBeNull();
  });
  it('statement needs who, pain and the first three whys', () => {
    expect(missingInput({ kind: 'statement' }, setField(filledCanvas(), 'why', 'whys.2', ''))).not.toBeNull();
    expect(missingInput({ kind: 'statement' }, setField(filledCanvas(), 'who', 'who', ' '))).not.toBeNull();
    expect(missingInput({ kind: 'statement' }, setField(filledCanvas(), 'why', 'whys.3', ''))).toBeNull();
  });
  it('assumptions needs who and pain only', () => {
    const c = setField(setField(emptyCanvas(), 'who', 'who', 'Nurses'), 'who', 'pain', 'Handover is slow');
    expect(missingInput({ kind: 'assumptions' }, c)).toBeNull();
    expect(missingInput({ kind: 'assumptions' }, setField(c, 'who', 'pain', ''))).not.toBeNull();
  });
  it('brief needs any input at all', () => {
    expect(missingInput({ kind: 'brief' }, setField(emptyCanvas(), 'who', 'who', 'Nurses'))).toBeNull();
  });
});
