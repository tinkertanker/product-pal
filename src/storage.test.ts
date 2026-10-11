import { describe, expect, it } from 'vitest';
import { briefedCanvas, filledCanvas } from './shared/fixtures';
import { draftOnDevice, parseSavedState } from './storage';

describe('parseSavedState', () => {
  it('starts afresh when there is nothing, or the text is damaged', () => {
    expect(parseSavedState(null).step).toBe(0);
    expect(parseSavedState('{nope').canvas.who.who).toBe('');
  });

  it('keeps a valid step and clamps a step from the old seven-step flow', () => {
    expect(parseSavedState(JSON.stringify({ step: 3 })).step).toBe(3);
    expect(parseSavedState(JSON.stringify({ step: 5 })).step).toBe(4);
    expect(parseSavedState(JSON.stringify({ step: 6 })).step).toBe(4);
    expect(parseSavedState(JSON.stringify({ step: -2 })).step).toBe(0);
    expect(parseSavedState(JSON.stringify({ step: 'x' })).step).toBe(0);
  });

  it('upgrades a first-version canvas and drops its saved challenges', () => {
    const old = {
      canvas: { idea: { who: 'nurses', pain: 'slow handover', wish: 'a summary', oneLine: '' }, build: { prompt: 'Old prompt', platform: 'codex' } },
      challenges: { idea: 'A challenge from the old coach', build: 'Another' },
      step: 6,
    };
    const state = parseSavedState(JSON.stringify(old));
    expect(state.canvas.who.who).toBe('nurses');
    expect(state.canvas.who.parkedIdea).toBe('a summary');
    expect(state.canvas.brief.document).toBe('Old prompt');
    expect(state.canvas.brief.platform).toBe('codex');
    expect(state.nudges).toEqual({});
    expect(state.step).toBe(4);
    expect(JSON.stringify(state)).not.toContain('challenge');
  });

  it('keeps well-formed nudges and ignores the rest', () => {
    const state = parseSavedState(
      JSON.stringify({ nudges: { who: { fingerprint: 'abc', text: 'Try this' }, why: { fingerprint: 1, text: 'x' }, idea: { fingerprint: 'a', text: 'old' } } }),
    );
    expect(state.nudges).toEqual({ who: { fingerprint: 'abc', text: 'Try this' } });
  });
});

describe('draftOnDevice', () => {
  it('is false for an empty save and true once they have typed or have a brief', () => {
    expect(draftOnDevice(parseSavedState(null))).toBe(false);
    expect(draftOnDevice({ ...parseSavedState(null), canvas: filledCanvas() })).toBe(true);
    expect(draftOnDevice({ ...parseSavedState(null), canvas: briefedCanvas() })).toBe(true);
  });
});
