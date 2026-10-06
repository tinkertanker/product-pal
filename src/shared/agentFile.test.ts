import { describe, expect, it } from 'vitest';
import { PLATFORMS } from './canvas';
import { WORKING_RULES, WORKING_RULES_LOVABLE, agentFileContent, agentFileName } from './agentFile';
import { briefedCanvas } from './fixtures';

describe('agentFileName', () => {
  it('picks the file each tool reads', () => {
    expect(agentFileName('claude-code')).toBe('CLAUDE.md');
    expect(agentFileName('codex')).toBe('AGENTS.md');
    expect(agentFileName('cursor')).toBe('AGENTS.md');
    expect(agentFileName('other')).toBe('AGENTS.md');
    expect(agentFileName('lovable')).toBe('PROJECT.md');
  });
  it('has a name for every platform', () => {
    for (const p of PLATFORMS) expect(agentFileName(p)).toMatch(/\.md$/);
  });
});

describe('agentFileContent', () => {
  it('puts the working rules above the brief and ends with one newline', () => {
    const canvas = briefedCanvas();
    canvas.brief.document = '\n\n# Handover: product brief\n\nHelp nurses.\n\n';
    const out = agentFileContent(canvas);
    expect(out.startsWith('# Working rules\nBuild story 1 first, then stop so I can try it.')).toBe(true);
    expect(out).toContain(`${WORKING_RULES}\n\n# Handover: product brief\n\nHelp nurses.\n`);
    expect(out.endsWith('Help nurses.\n')).toBe(true);
  });
  it('tells the agent to update the brief and to leave "Not building" alone', () => {
    expect(WORKING_RULES).toContain('update the brief below in the same commit');
    expect(WORKING_RULES).toContain('move answered open questions into the section they settle');
    expect(WORKING_RULES).toContain('"Not building"');
  });
  it('no longer tells the agent to grill the participant before every task', () => {
    for (const platform of PLATFORMS) {
      const canvas = briefedCanvas();
      canvas.brief.platform = platform;
      expect(agentFileContent(canvas).toLowerCase()).not.toContain('grill');
    }
  });
  it('uses the shorter rules for Lovable', () => {
    const canvas = briefedCanvas();
    canvas.brief.platform = 'lovable';
    const out = agentFileContent(canvas);
    expect(out).toContain(WORKING_RULES_LOVABLE);
    expect(out).toContain('keep to the screens in the walkthrough');
    expect(out).not.toContain('commit in small steps');
  });
  it('contains no em dashes', () => {
    expect(agentFileContent(briefedCanvas())).not.toContain('\u2014');
    expect(WORKING_RULES_LOVABLE).not.toContain('\u2014');
  });
});
