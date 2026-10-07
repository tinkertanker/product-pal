import { describe, expect, it } from 'vitest';
import { PLATFORMS } from './canvas';
import { WORKING_RULES, WORKING_RULES_LOVABLE, agentFileContent, agentFileName } from './agentFile';
import { briefedCanvas } from './fixtures';

describe('agentFileName', () => {
  it('never replaces a tool instructions file', () => {
    for (const platform of PLATFORMS) expect(agentFileName(platform)).toBe('PRODUCT_BRIEF.md');
  });
  it('has a name for every platform', () => {
    for (const p of PLATFORMS) expect(agentFileName(p)).toMatch(/\.md$/);
  });
});

describe('agentFileContent', () => {
  it('exports just the brief and ends with one newline', () => {
    const canvas = briefedCanvas();
    canvas.brief.document = '\n\n# Handover: product brief\n\nHelp nurses.\n\n';
    const out = agentFileContent(canvas);
    expect(out).toBe('# Handover: product brief\n\nHelp nurses.\n');
  });
  it('tells the agent to update the brief and to leave "Not building" alone', () => {
    expect(WORKING_RULES).toContain('update the brief in the same commit');
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
  it('keeps Lovable working rules out of the downloaded brief too', () => {
    const canvas = briefedCanvas();
    canvas.brief.platform = 'lovable';
    const out = agentFileContent(canvas);
    expect(out).not.toContain(WORKING_RULES_LOVABLE);
    expect(out).not.toContain('commit in small steps');
  });
  it('contains no em dashes', () => {
    expect(agentFileContent(briefedCanvas())).not.toContain('\u2014');
    expect(WORKING_RULES_LOVABLE).not.toContain('\u2014');
  });
});
