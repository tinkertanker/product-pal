import { describe, expect, it } from 'vitest';
import { parseSuggestion } from './suggestion';

describe('parseSuggestion', () => {
  it('extracts the block and returns the rest', () => {
    const text = '**What\'s working**\nClear user.\n\n```suggestion\nNew nurses need a faster handover.\n```\n';
    const r = parseSuggestion(text);
    expect(r.suggestion).toBe('New nurses need a faster handover.');
    expect(r.body).toBe("**What's working**\nClear user.");
    expect(r.pending).toBe(false);
  });
  it('keeps text after the block', () => {
    const r = parseSuggestion('Before\n```suggestion\nX\n```\nAfter');
    expect(r.body).toBe('Before\nAfter');
    expect(r.suggestion).toBe('X');
  });
  it('returns null when there is no block', () => {
    expect(parseSuggestion('Just text.')).toEqual({ body: 'Just text.', suggestion: null, pending: false });
  });
  it('hides a half-streamed block and marks it pending', () => {
    const r = parseSuggestion('Body here.\n\n```suggestion\nPartial sugg');
    expect(r.body).toBe('Body here.');
    expect(r.suggestion).toBeNull();
    expect(r.pending).toBe(true);
  });
  it('accepts the word on the line after the fence', () => {
    const r = parseSuggestion('Intro\n\n```\nsuggestion\nNight nurses need X.\n```');
    expect(r.suggestion).toBe('Night nurses need X.');
    expect(r.body).toBe('Intro');
  });
  it('hides a fence that has just opened', () => {
    expect(parseSuggestion('Intro\n\n```').pending).toBe(true);
    expect(parseSuggestion('Intro\n\n```sugg').pending).toBe(true);
    expect(parseSuggestion('Intro\n\n```js').pending).toBe(false);
  });
  it('does not treat other fences as suggestions', () => {
    const r = parseSuggestion('```js\ncode\n```');
    expect(r.suggestion).toBeNull();
    expect(r.body).toBe('```js\ncode\n```');
  });
  it('handles longer fences and multi-line suggestions', () => {
    const r = parseSuggestion('Intro\n````suggestion\nLine one\nLine two\n````');
    expect(r.suggestion).toBe('Line one\nLine two');
  });
});
