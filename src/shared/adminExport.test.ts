import { describe, expect, it } from 'vitest';
import { emptyCanvas } from './canvas';
import { allParticipantsMarkdown, demoteHeadings } from './adminExport';
import { briefedCanvas, filledCanvas } from './fixtures';

describe('allParticipantsMarkdown', () => {
  it('uses nicknames as headings, with the brief and notes underneath', () => {
    const md = allParticipantsMarkdown([
      { nickname: 'Coral Otter', canvas: briefedCanvas() },
      { nickname: 'Quick Heron', canvas: emptyCanvas() },
    ]);
    expect(md.startsWith('# Coral Otter\n\n## Handover summary: product brief')).toBe(true);
    expect(md).toContain('\n---\n\n# Quick Heron\n\n## My notes');
    expect(md).toContain('### 1. Who hurts');
    expect(md.endsWith('\n')).toBe(true);
  });
  it('shows the notes alone when nobody has a brief yet', () => {
    const md = allParticipantsMarkdown([{ nickname: 'Coral Otter', canvas: filledCanvas() }]);
    expect(md.startsWith('# Coral Otter\n\n## My notes')).toBe(true);
  });
  it('says so when nobody has joined', () => {
    expect(allParticipantsMarkdown([])).toContain('Nobody has joined yet.');
  });
});

describe('demoteHeadings', () => {
  it('pushes headings down a level but leaves code fences and other lines alone', () => {
    const md = '# One\n## Two\ntext # not a heading\n```\n# comment in code\n```\n###### Six';
    expect(demoteHeadings(md)).toBe('## One\n### Two\ntext # not a heading\n```\n# comment in code\n```\n###### Six');
  });
});
