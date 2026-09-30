import { describe, expect, it } from 'vitest';
import { emptyCanvas, setField, type ChatMessage } from './canvas';
import { filledCanvas } from './fixtures';
import { SYNC_MAX_BYTES, buildSyncRequest, serialiseSync } from './syncBody';
import { LIMITS } from './validation';

const chat = (n: number, size = 10): ChatMessage[] =>
  Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: 'x'.repeat(size) }));

describe('buildSyncRequest', () => {
  it('keeps chats and judgements, unlike a coach request', () => {
    const canvas = { ...filledCanvas(), chats: { ...emptyCanvas().chats, idea: chat(4) } };
    canvas.judgements = { idea: { step: 'idea', pass: true, checks: [], fingerprint: 'abc', at: 5 } };
    const req = buildSyncRequest({ code: 'M82T7', clientId: 'c1', canvas, done: ['idea'] });
    expect(req.canvas.chats.idea).toHaveLength(4);
    expect(req.canvas.judgements.idea?.fingerprint).toBe('abc');
    expect(req.done).toEqual(['idea']);
    expect(req.clientId).toBe('c1');
  });
  it('clamps each step chat to the server limits', () => {
    const canvas = { ...emptyCanvas(), chats: { ...emptyCanvas().chats, why: chat(LIMITS.messages + 10, LIMITS.message + 50) } };
    const req = buildSyncRequest({ code: 'c', clientId: 'c', canvas, done: [] });
    expect(req.canvas.chats.why.length).toBeLessThanOrEqual(LIMITS.messages);
    for (const m of req.canvas.chats.why) expect(m.content.length).toBeLessThanOrEqual(LIMITS.message);
    expect(req.canvas.chats.why[0]?.role).toBe('user');
  });
  it('clamps long fields', () => {
    const canvas = setField(emptyCanvas(), 'idea', 'pain', 'y'.repeat(LIMITS.field + 100));
    const req = buildSyncRequest({ code: 'c', clientId: 'c', canvas, done: [] });
    expect(req.canvas.idea.pain).toHaveLength(LIMITS.field);
  });
});

describe('serialiseSync', () => {
  it('passes a normal canvas', () => {
    const out = serialiseSync(buildSyncRequest({ code: 'c', clientId: 'c', canvas: filledCanvas(), done: [] }));
    expect(out.ok).toBe(true);
  });
  it('refuses a body over the cap', () => {
    const big = { ...emptyCanvas(), chats: Object.fromEntries(['idea', 'why', 'problem', 'metric', 'assumption', 'experience', 'build'].map((id) => [id, chat(LIMITS.messages, LIMITS.message)])) } as ReturnType<typeof emptyCanvas>;
    const out = serialiseSync(buildSyncRequest({ code: 'c', clientId: 'c', canvas: big, done: [] }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.bytes).toBeGreaterThan(SYNC_MAX_BYTES);
  });
});
