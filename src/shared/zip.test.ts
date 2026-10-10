import { describe, expect, it } from 'vitest';
import { buildZip, crc32 } from './zip';

const text = new TextEncoder();

describe('crc32', () => {
  it('matches the ZIP of empty and of hello', () => {
    expect(crc32(text.encode(''))).toBe(0);
    expect(crc32(text.encode('hello'))).toBe(0x3610a686);
  });
});

describe('buildZip', () => {
  it('stores each file uncompressed under its name', () => {
    const zip = buildZip([
      { name: 'AGENTS.md', content: 'Be simple.\n' },
      { name: 'PRODUCT_BRIEF.md', content: '# Brief\n' },
    ]);
    const asText = new TextDecoder().decode(zip);
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(asText).toContain('AGENTS.md');
    expect(asText).toContain('PRODUCT_BRIEF.md');
    expect(asText).toContain('Be simple.\n');
    expect(asText).toContain('# Brief\n');
  });
});
