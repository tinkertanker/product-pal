import { describe, expect, it } from 'vitest';
import { PLATFORMS } from './canvas';
import { briefedCanvas } from './fixtures';
import { kickoffMessage } from './kickoff';

describe('kickoffMessage', () => {
  it('names the file the tool reads and asks for one round of questions', () => {
    const canvas = briefedCanvas();
    expect(kickoffMessage(canvas)).toBe(
      'Read CLAUDE.md. Ask me its open questions, and anything else you would otherwise guess, in one round of up to three questions, each with your recommended answer. Write my answers into the file. Then propose a plan for story 1 and wait for my go-ahead.',
    );
    canvas.brief.platform = 'codex';
    expect(kickoffMessage(canvas)).toContain('Read AGENTS.md.');
    canvas.brief.platform = 'cursor';
    expect(kickoffMessage(canvas)).toContain('Read AGENTS.md.');
    canvas.brief.platform = 'other';
    expect(kickoffMessage(canvas)).toContain('Read AGENTS.md.');
  });
  it('drops the file reference for Lovable, which has no file to read', () => {
    const canvas = briefedCanvas();
    canvas.brief.platform = 'lovable';
    const text = kickoffMessage(canvas);
    expect(text).not.toContain('Read ');
    expect(text).not.toContain('.md');
    expect(text).toContain('one round of up to three questions, each with your recommended answer');
    expect(text).toContain('propose a plan for story 1 and wait for my go-ahead');
  });
  it('has no em dashes, and never asks to be grilled', () => {
    for (const platform of PLATFORMS) {
      const canvas = briefedCanvas();
      canvas.brief.platform = platform;
      const text = kickoffMessage(canvas);
      expect(text).not.toContain('\u2014');
      expect(text.toLowerCase()).not.toContain('grill');
    }
  });
});
