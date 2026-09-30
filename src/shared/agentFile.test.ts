import { describe, expect, it } from 'vitest';
import { PLATFORMS } from './canvas';
import { agentFileContent, agentFileName } from './agentFile';

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
  it('puts a short header above the prompt and ends with one newline', () => {
    const out = agentFileContent('\n\n# Context\n\nHelp nurses.\n\n');
    expect(out.startsWith('# Project brief\n\nThis file was written in Product Pal.')).toBe(true);
    expect(out).toContain('keep it up to date as decisions change.\n\n# Context\n\nHelp nurses.\n');
    expect(out.endsWith('Help nurses.\n')).toBe(true);
  });
  it('contains no em dashes', () => {
    expect(agentFileContent('x')).not.toContain('—');
  });
});
