import { describe, expect, it } from 'vitest';
import { emptyCanvas, setField, type ChatMessage } from './canvas';
import { filledCanvas } from './fixtures';
import { SYNC_MAX_BYTES, buildSyncRequest, serialiseSync } from './syncBody';
import { LIMITS, validateSyncRequest } from './validation';

const chat = (n: number, size = 10): ChatMessage[] =>
  Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', content: 'x'.repeat(size) }));

describe('buildSyncRequest', () => {
  it('keeps chats, judgements and meta, unlike a coach request', () => {
    const canvas = { ...filledCanvas(), chats: { ...emptyCanvas().chats, who: chat(4) } };
    canvas.judgements = { who: { step: 'who', pass: true, checks: [], fingerprint: 'abc', at: 5 } };
    canvas.meta = { joinedAt: 111, firstInputAt: 222 };
    const req = buildSyncRequest({ code: 'M82T7', clientId: 'c1', canvas, done: ['who'] });
    expect(req.canvas.chats.who).toHaveLength(2);
    expect(req.canvas.judgements.who?.fingerprint).toBe('abc');
    expect(req.canvas.meta).toEqual({ joinedAt: 111, firstInputAt: 222 });
    expect(req.done).toEqual(['who']);
    expect(req.clientId).toBe('c1');
  });
  it('sends only the participant\'s turns', () => {
    const canvas = { ...emptyCanvas(), chats: { ...emptyCanvas().chats, who: chat(5) } };
    const req = buildSyncRequest({ code: 'c', clientId: 'c', canvas, done: [] });
    expect(req.canvas.chats.who).toHaveLength(3);
    expect(req.canvas.chats.who.every((m) => m.role === 'user')).toBe(true);
  });
  it('clamps each step chat to the server limits', () => {
    const canvas = { ...emptyCanvas(), chats: { ...emptyCanvas().chats, why: chat((LIMITS.messages + 10) * 2, LIMITS.message + 50) } };
    const req = buildSyncRequest({ code: 'c', clientId: 'c', canvas, done: [] });
    expect(req.canvas.chats.why.length).toBeLessThanOrEqual(LIMITS.messages);
    for (const m of req.canvas.chats.why) expect(m.content.length).toBeLessThanOrEqual(LIMITS.message);
    expect(req.canvas.chats.why[0]?.role).toBe('user');
  });
  it('clamps long fields', () => {
    const canvas = setField(emptyCanvas(), 'who', 'pain', 'y'.repeat(LIMITS.field + 100));
    const req = buildSyncRequest({ code: 'c', clientId: 'c', canvas, done: [] });
    expect(req.canvas.who.pain).toHaveLength(LIMITS.field);
  });
});

describe('a built sync request', () => {
  it('passes the server\'s own validation unchanged', () => {
    const canvas = filledCanvas();
    canvas.chats.why = chat(4);
    canvas.meta = { joinedAt: 9, firstInputAt: 10 };
    const req = buildSyncRequest({ code: 'c', clientId: 'c', canvas, done: ['who', 'why'] });
    const checked = validateSyncRequest(JSON.parse(JSON.stringify(req)));
    expect(checked.ok && checked.value.canvas.meta).toEqual({ joinedAt: 9, firstInputAt: 10 });
    expect(checked.ok && checked.value.canvas.chats.why).toHaveLength(2);
    expect(checked.ok && checked.value.canvas.who).toEqual(canvas.who);
  });
});

describe('serialiseSync', () => {
  it('passes a normal canvas', () => {
    const out = serialiseSync(buildSyncRequest({ code: 'c', clientId: 'c', canvas: filledCanvas(), done: [] }));
    expect(out.ok).toBe(true);
  });
  it('keeps the client guard under the server cap of 64 KB', () => {
    expect(SYNC_MAX_BYTES).toBe(60_000);
    expect(SYNC_MAX_BYTES).toBeLessThan(64_000);
  });
  it('refuses a body over the cap', () => {
    const big = { ...emptyCanvas(), chats: Object.fromEntries(['who', 'why', 'success', 'bet', 'brief'].map((id) => [id, chat(LIMITS.messages * 2, LIMITS.message)])) } as ReturnType<typeof emptyCanvas>;
    const out = serialiseSync(buildSyncRequest({ code: 'c', clientId: 'c', canvas: big, done: [] }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.bytes).toBeGreaterThan(SYNC_MAX_BYTES);
  });
});
