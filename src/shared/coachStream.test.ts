import { describe, expect, it } from 'vitest';
import { END_MARK, cleanChunk, endMarker, readCoachStream } from './coachStream';

describe('readCoachStream', () => {
  it('has no end until the marker arrives', () => {
    expect(readCoachStream('Hello the')).toEqual({ text: 'Hello the', end: null });
  });
  it('splits the text from how it ended', () => {
    expect(readCoachStream(`Hello${endMarker('ok')}`)).toEqual({ text: 'Hello', end: 'ok' });
    expect(readCoachStream(`Hello${endMarker('truncated')}`)).toEqual({ text: 'Hello', end: 'truncated' });
    expect(readCoachStream(`Hello${endMarker('failed')}`)).toEqual({ text: 'Hello', end: 'failed' });
  });
  it('treats an unknown end word as a failure', () => {
    expect(readCoachStream(`Hello${END_MARK}huh`)).toEqual({ text: 'Hello', end: 'failed' });
  });
});

describe('cleanChunk', () => {
  it('removes the marker if the model writes it', () => {
    expect(cleanChunk(`a${END_MARK}b${END_MARK}`)).toBe('ab');
  });
});
