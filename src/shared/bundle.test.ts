import { describe, expect, it } from 'vitest';
import { briefedCanvas } from './fixtures';
import { agentsFile, bundleFiles, claudeFile, copyAllPrompt, notBuildingItems } from './bundle';
import { DEFAULT_STACK } from './design';

describe('notBuildingItems', () => {
  it('copies each bullet as written and does not split on commas', () => {
    const document = [
      '## Not building',
      '- No student accounts or passwords beyond tapping a name.',
      '- No payments, waiting lists or workshop browsing.',
      '## Open questions',
      '- Which ward?',
    ].join('\n');
    expect(notBuildingItems(document)).toEqual([
      'No student accounts or passwords beyond tapping a name.',
      'No payments, waiting lists or workshop browsing.',
    ]);
  });
  it('is empty when the section is missing', () => {
    expect(notBuildingItems('# Title\n\n## Problem\nHello.')).toEqual([]);
  });
});

describe('the build bundle', () => {
  it('has the four files in read order', () => {
    expect(bundleFiles(briefedCanvas()).map((f) => f.name)).toEqual([
      'CLAUDE.md',
      'AGENTS.md',
      'PRODUCT_BRIEF.md',
      'DESIGN.md',
    ]);
  });
  it('puts rules, brief then design in AGENTS.md, and does not invent MUST NOT lines from commas', () => {
    const canvas = briefedCanvas();
    canvas.brief.document = canvas.brief.document.replace(
      '- A new app\n- Alerts\n- Anything for day shift',
      '- No payments, waiting lists or workshop browsing.',
    );
    const agents = agentsFile(canvas);
    expect(agents).toContain('1. AGENTS.md (this file)');
    expect(agents).toContain('2. PRODUCT_BRIEF.md');
    expect(agents).toContain('3. DESIGN.md');
    expect(agents).toContain('Do not split a line on commas');
    expect(agents).toContain('- No payments, waiting lists or workshop browsing.');
    expect(agents).not.toMatch(/MUST NOT/);
    expect(agents).not.toContain('- waiting lists');
  });
  it('tells Claude to build in three passes and point at the other files', () => {
    const index = claudeFile();
    expect(index).toContain('AGENTS.md');
    expect(index).toContain('PRODUCT_BRIEF.md');
    expect(index).toContain('DESIGN.md');
    expect(index).toContain('**Core.**');
    expect(index).toContain('**Use it.**');
    expect(index).toContain('**Polish.**');
  });
  it('inlines every file in the copy-all prompt', () => {
    const all = copyAllPrompt(briefedCanvas());
    expect(all).toContain('## CLAUDE.md');
    expect(all).toContain('## AGENTS.md');
    expect(all).toContain('## PRODUCT_BRIEF.md');
    expect(all).toContain('## DESIGN.md');
    expect(all).toContain(briefedCanvas().brief.document.trim());
    expect(all).toContain(DEFAULT_STACK);
  });
  it('contains no em dashes', () => {
    for (const file of bundleFiles(briefedCanvas())) {
      expect(file.content).not.toContain('\u2014');
    }
    expect(copyAllPrompt(briefedCanvas())).not.toContain('\u2014');
  });
});
