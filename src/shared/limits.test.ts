import { describe, expect, it } from 'vitest';
import { codeFailKey, clientKey, ipKey, takeAll, type Limiter } from './limits';

const allow: Limiter = { limit: async () => ({ success: true }) };
const deny: Limiter = { limit: async () => ({ success: false }) };
const broken: Limiter = { limit: async () => { throw new Error('boom'); } };

describe('keys', () => {
  it('namespaces keys and falls back for a missing IP', () => {
    expect(clientKey('abc')).toBe('client:abc');
    expect(ipKey('1.2.3.4')).toBe('ip:1.2.3.4');
    expect(ipKey(null)).toBe('ip:unknown');
    expect(codeFailKey(undefined)).toBe('codefail:unknown');
  });
});

describe('takeAll', () => {
  it('allows when every limiter allows, or none is configured', async () => {
    expect(await takeAll([{ limiter: allow, key: 'a' }, { limiter: undefined, key: 'b' }])).toBe(true);
    expect(await takeAll([])).toBe(true);
  });
  it('denies when any limiter denies', async () => {
    expect(await takeAll([{ limiter: allow, key: 'a' }, { limiter: deny, key: 'b' }])).toBe(false);
  });
  it('fails open if a limiter throws', async () => {
    expect(await takeAll([{ limiter: broken, key: 'a' }])).toBe(true);
  });
  it('passes the key through', async () => {
    const seen: string[] = [];
    await takeAll([{ limiter: { limit: async ({ key }) => (seen.push(key), { success: true }) }, key: 'k1' }]);
    expect(seen).toEqual(['k1']);
  });
});
