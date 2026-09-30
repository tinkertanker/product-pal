import { describe, expect, it } from 'vitest';
import { emptyCanvas } from './canvas';
import { allParticipantsMarkdown } from './adminExport';
import { filledCanvas } from './fixtures';

describe('allParticipantsMarkdown', () => {
  it('uses nicknames as headings and drops the canvas title', () => {
    const md = allParticipantsMarkdown([
      { nickname: 'Coral Otter', canvas: filledCanvas() },
      { nickname: 'Quick Heron', canvas: emptyCanvas() },
    ]);
    expect(md.startsWith('# Coral Otter\n\n## 1. Your idea')).toBe(true);
    expect(md).toContain('\n---\n\n# Quick Heron\n\n## 1. Your idea');
    expect(md).not.toContain('# Product canvas');
    expect(md.endsWith('\n')).toBe(true);
  });
  it('says so when nobody has joined', () => {
    expect(allParticipantsMarkdown([])).toContain('Nobody has joined yet.');
  });
});
