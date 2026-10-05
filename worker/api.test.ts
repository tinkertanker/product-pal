// Routes added for the step checker, sync, settings and admin. `env.DB` is a
// hand-rolled in-memory fake that understands exactly the statements in store.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { handle, type Env } from './index';
import { emptyCanvas } from '../src/shared/canvas';
import { nicknameFor } from '../src/shared/contracts';
import { checksFor } from '../src/shared/judge';
import { filledCanvas } from '../src/shared/fixtures';

type Row = Record<string, unknown>;

function fakeDb() {
  const participants = new Map<string, Row>();
  const settings = new Map<string, string>();

  const run = (sql: string, args: unknown[]) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('INSERT INTO participants')) {
      const [id, nickname, canvas, done, length, now] = args as [string, string, string, string, number, number];
      const existing = participants.get(id);
      participants.set(id, {
        client_id: id, nickname, canvas, done, build_prompt_length: length,
        created_at: existing?.created_at ?? now, updated_at: now,
      });
      return { results: [], first: null, changes: 1 };
    }
    if (q.startsWith('SELECT client_id, nickname, done, build_prompt_length, created_at, updated_at, canvas FROM participants WHERE')) {
      return { results: [], first: participants.get(args[0] as string) ?? null, changes: 0 };
    }
    if (q.startsWith('SELECT client_id, nickname, done, build_prompt_length, created_at, updated_at FROM participants')) {
      const rows = [...participants.values()]
        .sort((a, b) => (b.updated_at as number) - (a.updated_at as number))
        .slice(0, args[0] as number)
        .map(({ canvas: _canvas, ...rest }) => rest);
      return { results: rows, first: null, changes: 0 };
    }
    if (q.startsWith('DELETE FROM participants')) {
      const changes = participants.size;
      participants.clear();
      return { results: [], first: null, changes };
    }
    if (q.startsWith('SELECT key, value FROM settings')) {
      return { results: [...settings].map(([key, value]) => ({ key, value })), first: null, changes: 0 };
    }
    if (q.startsWith('INSERT INTO settings')) {
      settings.set(args[0] as string, args[1] as string);
      return { results: [], first: null, changes: 1 };
    }
    throw new Error(`fake db does not know: ${q}`);
  };

  const statement = (sql: string, args: unknown[] = []) => ({
    bind: (...bound: unknown[]) => statement(sql, bound),
    run: async () => ({ success: true, meta: { changes: run(sql, args).changes } }),
    first: async () => run(sql, args).first,
    all: async () => ({ results: run(sql, args).results }),
  });
  const db = {
    prepare: (sql: string) => statement(sql),
    batch: async (list: ReturnType<typeof statement>[]) => Promise.all(list.map((s) => s.run())),
  };
  return { db: db as unknown as D1Database, participants, settings };
}

const env = (over: Partial<Env> = {}): Env => ({
  ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
  WORKSHOP_CODE: 'M82T7',
  LLM_API_KEY: 'test-key',
  LLM_BASE_URL: 'https://llm.example.com',
  LLM_MODEL: 'test-model',
  ...over,
});

const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://x.test${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

const admin = (password = 'pw') => ({ Authorization: `Bearer ${password}` });
const json = async (res: Response) => (await res.json()) as Record<string, any>;

afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------

describe('/api/judge', () => {
  const judgeBody = (over: Record<string, unknown> = {}) => ({
    code: 'm82t7', clientId: 'c1', step: 'who', canvas: filledCanvas(), ...over,
  });
  const jevReply = (p: number, over: Record<string, number> = {}) =>
    Response.json({
      model: 'jev-1.13.0',
      answers: Object.fromEntries(checksFor('who').map((c) => [c.id, { type: 'noul', noul: over[c.id] ?? p }])),
      usage: { input_tokens: 1, output_tokens: 1 },
    });

  it('needs a right code, a coach step and a valid canvas', async () => {
    const e = env({ TYPESAFE_API_KEY: 'k' });
    expect((await handle(req('POST', '/api/judge', judgeBody({ code: 'bad' })), e)).status).toBe(401);
    expect((await handle(req('POST', '/api/judge', judgeBody({ step: 'idea' })), e)).status).toBe(400);
    expect((await handle(req('POST', '/api/judge', judgeBody({ canvas: { who: { who: 1 } } })), e)).status).toBe(400);
    expect((await handle(req('POST', '/api/judge', '{oops'), e)).status).toBe(400);
    expect((await handle(req('GET', '/api/judge'), e)).status).toBe(404);
  });

  it('answers 503 when there is no Jev key', async () => {
    const res = await handle(req('POST', '/api/judge', judgeBody()), env());
    expect(res.status).toBe(503);
    expect((await json(res)).error).toBeTruthy();
  });

  it('calls Jev with noul questions and returns a judgement with the step fingerprint', async () => {
    const fetchMock = vi.fn(async () => jevReply(0.9));
    vi.stubGlobal('fetch', fetchMock);
    const res = await handle(req('POST', '/api/judge', judgeBody({ clarifications: ['I timed it.'] })), env({ TYPESAFE_API_KEY: 'k' }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ step: 'who', pass: true });
    expect(body.checks.map((c: { id: string }) => c.id)).toEqual(checksFor('who').map((c) => c.id));
    expect(body.checks.every((c: { fix?: string }) => typeof c.fix === 'string' && c.fix.length > 0)).toBe(true);
    expect(body.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(typeof body.at).toBe('number');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe('jev-latest');
    expect(sent.state.clarifications).toEqual(['I timed it.']);
    expect(Object.keys(sent.state.fields)).toEqual(['who', 'pain', 'evidence']);
    expect(init.body as string).not.toContain('A summary of what changed since the last shift');
    expect(Object.values(sent.questions as Record<string, { type: string }>).every((q) => q.type === 'noul')).toBe(true);
  });

  it('fails the step when Jev says placeholder text', async () => {
    vi.stubGlobal('fetch', async () => jevReply(0.9, { genuine: 0.05 }));
    const body = await json(await handle(req('POST', '/api/judge', judgeBody()), env({ TYPESAFE_API_KEY: 'k' })));
    expect(body.pass).toBe(false);
    expect(body.checks[0]).toMatchObject({ id: 'genuine', pass: false });
  });

  it('answers 502 with the friendly message when Jev fails or answers oddly', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const e = env({ TYPESAFE_API_KEY: 'k' });
    for (const reply of [() => new Response('no', { status: 529 }), () => new Response('no', { status: 401 }), () => Response.json({ nope: 1 })]) {
      vi.stubGlobal('fetch', async () => reply());
      const res = await handle(req('POST', '/api/judge', judgeBody()), e);
      expect(res.status).toBe(502);
      expect((await json(res)).error).toBe("The step checker couldn't answer just now. Please try again in a moment.");
    }
    vi.stubGlobal('fetch', async () => {
      throw new Error('network down');
    });
    expect((await handle(req('POST', '/api/judge', judgeBody()), e)).status).toBe(502);
  });

  it('is rate limited per client and per IP', async () => {
    vi.stubGlobal('fetch', async () => jevReply(0.9));
    const no = { limit: async () => ({ success: false }) };
    const yes = { limit: async () => ({ success: true }) };
    const e = env({ TYPESAFE_API_KEY: 'k' });
    expect((await handle(req('POST', '/api/judge', judgeBody()), { ...e, JUDGE_CLIENT_LIMITER: no })).status).toBe(429);
    expect((await handle(req('POST', '/api/judge', judgeBody()), { ...e, COACH_IP_LIMITER: no })).status).toBe(429);
    const res = await handle(req('POST', '/api/judge', judgeBody()), { ...e, JUDGE_CLIENT_LIMITER: yes, COACH_IP_LIMITER: yes });
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------

describe('coach clarifications', () => {
  it('rejects malformed clarifications with 400', async () => {
    const body = { code: 'M82T7', clientId: 'c', mode: 'brief', canvas: emptyCanvas(), clarifications: { nope: ['x'] } };
    const res = await handle(req('POST', '/api/coach', body), env());
    expect(res.status).toBe(400);
    expect((await json(res)).error).toContain('clarifications.nope');
  });
  it('passes good clarifications into the brief prompt sent to the LLM', async () => {
    const fetchMock = vi.fn(async () => new Response('data: [DONE]\n\n'));
    vi.stubGlobal('fetch', fetchMock);
    const body = { code: 'M82T7', clientId: 'c', mode: 'brief', canvas: filledCanvas(), clarifications: { why: ['It is only ward 4.'] } };
    await (await handle(req('POST', '/api/coach', body), env())).text();
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const sent = JSON.parse(init.body as string) as { messages: { content: string }[]; max_tokens: number };
    expect(init.body as string).toContain('It is only ward 4.');
    expect(init.body as string).toContain('```fit');
    expect(sent.max_tokens).toBe(16000);
  });
  it('builds each mode\'s prompt from the new request shapes', async () => {
    const fetchMock = vi.fn(async () => new Response('data: [DONE]\n\n'));
    vi.stubGlobal('fetch', fetchMock);
    const canvas = filledCanvas();
    canvas.brief.document = 'A brief to review.';
    const bodies = [
      { mode: 'nudge', step: 'why', failed: ['goes_deeper'] },
      { mode: 'questions', step: 'bet', messages: [{ role: 'user', content: 'Ask me questions about my riskiest bet.' }] },
      { mode: 'statement' },
      { mode: 'assumptions' },
      { mode: 'review' },
    ];
    for (const extra of bodies) {
      const res = await handle(req('POST', '/api/coach', { code: 'M82T7', clientId: 'c', canvas, ...extra }), env());
      expect(res.status, extra.mode).toBe(502);
      await res.text();
      const init = (fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1];
      expect(init.body as string).toContain(`Mode: ${extra.mode}`);
    }
  });
  it('refuses a nudge with check ids that are not on the step, and the old modes', async () => {
    const bad = { code: 'M82T7', clientId: 'c', mode: 'nudge', step: 'who', failed: ['goes_deeper'], canvas: emptyCanvas() };
    expect((await handle(req('POST', '/api/coach', bad), env())).status).toBe(400);
    expect((await handle(req('POST', '/api/coach', { ...bad, mode: 'grill' }), env())).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------

describe('/api/sync', () => {
  const syncBody = (over: Record<string, unknown> = {}) => ({
    code: 'm82t7', clientId: 'abc-123', canvas: filledCanvas(), done: ['who', 'why'], ...over,
  });

  it('stores the participant with their nickname and done steps, and answers 204', async () => {
    const { db, participants } = fakeDb();
    const res = await handle(req('POST', '/api/sync', syncBody()), env({ DB: db }));
    expect(res.status).toBe(204);
    const row = participants.get('abc-123');
    expect(row).toMatchObject({ nickname: nicknameFor('abc-123'), done: '["who","why"]', build_prompt_length: 0 });
    expect(JSON.parse(row?.canvas as string).who.who).toBe('New nurses on night shift');
  });

  it('keeps the chats, judgements and meta in what it stores', async () => {
    const { db, participants } = fakeDb();
    const canvas = filledCanvas();
    canvas.chats.who = [{ role: 'user', content: 'Ask me questions about my person and their pain.' }];
    canvas.judgements.who = { step: 'who', pass: false, fingerprint: 'abc', at: 5, checks: [{ id: 'specific_user', label: 'Names one person or role', probability: 0.1, pass: false, fix: 'Name one person or role.' }] };
    canvas.meta = { joinedAt: 1000, firstInputAt: 61000 };
    await handle(req('POST', '/api/sync', syncBody({ canvas })), env({ DB: db }));
    const stored = JSON.parse(participants.get('abc-123')?.canvas as string);
    expect(stored.chats.who).toHaveLength(1);
    expect(stored.judgements.who.checks[0].fix).toBe('Name one person or role.');
    expect(stored.meta).toEqual({ joinedAt: 1000, firstInputAt: 61000 });
  });

  it('maps the first version\'s step ids in done', async () => {
    const { db, participants } = fakeDb();
    await handle(req('POST', '/api/sync', syncBody({ done: ['idea', 'problem', 'build'] })), env({ DB: db }));
    expect(participants.get('abc-123')?.done).toBe('["who","why","brief"]');
  });

  it('updates the same row on the next sync and keeps created_at', async () => {
    const { db, participants } = fakeDb();
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    const canvas = filledCanvas();
    canvas.brief.document = 'Build it please.';
    await handle(req('POST', '/api/sync', syncBody()), env({ DB: db }));
    await handle(req('POST', '/api/sync', syncBody({ canvas, done: ['who', 'brief'] })), env({ DB: db }));
    expect(participants.size).toBe(1);
    expect(participants.get('abc-123')).toMatchObject({ created_at: 1000, updated_at: 2000, build_prompt_length: 16, done: '["who","brief"]' });
    vi.restoreAllMocks();
  });

  it('checks the code and the payload', async () => {
    const e = env({ DB: fakeDb().db });
    expect((await handle(req('POST', '/api/sync', syncBody({ code: 'bad' })), e)).status).toBe(401);
    expect((await handle(req('POST', '/api/sync', syncBody({ done: ['nope'] })), e)).status).toBe(400);
    expect((await handle(req('POST', '/api/sync', syncBody({ canvas: { chats: { who: [{ role: 'user', content: 'x'.repeat(4001) }] } } })), e)).status).toBe(400);
    expect((await handle(req('POST', '/api/sync', '{oops'), e)).status).toBe(400);
  });

  it('rejects a body over 200 KB with 413', async () => {
    const e = env({ DB: fakeDb().db });
    const big = JSON.stringify(syncBody({ padding: 'x'.repeat(200_001) }));
    const res = await handle(req('POST', '/api/sync', big), e);
    expect(res.status).toBe(413);
    expect((await json(res)).error).toBeTruthy();
    const justUnder = JSON.stringify(syncBody());
    expect(justUnder.length).toBeLessThan(200_000);
    expect((await handle(req('POST', '/api/sync', justUnder), e)).status).toBe(204);
  });

  it('answers 503 without a database, and 429 when limited', async () => {
    expect((await handle(req('POST', '/api/sync', syncBody()), env())).status).toBe(503);
    const no = { limit: async () => ({ success: false }) };
    expect((await handle(req('POST', '/api/sync', syncBody()), env({ DB: fakeDb().db, SYNC_CLIENT_LIMITER: no }))).status).toBe(429);
  });

  it('accepts text/plain bodies, as sendBeacon sends them', async () => {
    const { db, participants } = fakeDb();
    const res = await handle(req('POST', '/api/sync', syncBody(), { 'Content-Type': 'text/plain;charset=UTF-8' }), env({ DB: db }));
    expect(res.status).toBe(204);
    expect(participants.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('/api/settings', () => {
  it('needs no code and defaults when nothing is stored', async () => {
    const res = await handle(req('GET', '/api/settings'), env({ DB: fakeDb().db }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ showTimings: false, aiJudge: true, judgeAvailable: false });
  });
  it('merges stored settings and reports whether the judge key is set', async () => {
    const { db, settings } = fakeDb();
    settings.set('showTimings', 'true');
    settings.set('aiJudge', 'false');
    const res = await handle(req('GET', '/api/settings'), env({ DB: db, TYPESAFE_API_KEY: 'k' }));
    expect(await res.json()).toEqual({ showTimings: true, aiJudge: false, judgeAvailable: true });
  });
  it('falls back to the defaults with no database, or a broken one', async () => {
    expect(await (await handle(req('GET', '/api/settings'), env())).json()).toMatchObject({ showTimings: false, aiJudge: true });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { prepare: () => { throw new Error('boom'); } } as unknown as D1Database;
    expect((await handle(req('GET', '/api/settings'), env({ DB: broken }))).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------

describe('/api/admin/*', () => {
  const setup = () => {
    const fake = fakeDb();
    return { ...fake, e: env({ DB: fake.db, ADMIN_PASSWORD: 'pw' }) };
  };

  it('answers 503 on every admin route when no password is set', async () => {
    const e = env({ DB: fakeDb().db });
    for (const [method, path] of [['GET', '/api/admin/participants'], ['GET', '/api/admin/participants/x'], ['GET', '/api/admin/settings'], ['PUT', '/api/admin/settings'], ['DELETE', '/api/admin/participants']]) {
      expect((await handle(req(method as string, path as string, undefined, admin()), e)).status).toBe(503);
    }
  });

  it('answers 401 without the right bearer password', async () => {
    const { e } = setup();
    expect((await handle(req('GET', '/api/admin/participants'), e)).status).toBe(401);
    expect((await handle(req('GET', '/api/admin/participants', undefined, admin('nope')), e)).status).toBe(401);
    expect((await handle(req('DELETE', '/api/admin/participants', undefined, admin('nope')), e)).status).toBe(401);
  });

  it('counts wrong passwords against the code-fail limiter', async () => {
    const seen: string[] = [];
    const limiter = { limit: async ({ key }: { key: string }) => (seen.push(key), { success: false }) };
    const res = await handle(req('GET', '/api/admin/participants', undefined, { ...admin('nope'), 'CF-Connecting-IP': '1.2.3.4' }), { ...setup().e, CODE_FAIL_LIMITER: limiter });
    expect(res.status).toBe(429);
    expect(seen).toEqual(['codefail:1.2.3.4']);
  });

  it('lists participants, newest activity first, without their canvases', async () => {
    const { e, participants } = setup();
    participants.set('a', { client_id: 'a', nickname: 'Amber Otter', canvas: '{}', done: '["who"]', build_prompt_length: 0, created_at: 1, updated_at: 10 });
    participants.set('b', { client_id: 'b', nickname: 'Brave Panda', canvas: '{}', done: '["idea","why","build"]', build_prompt_length: 500, created_at: 2, updated_at: 20 });
    const res = await handle(req('GET', '/api/admin/participants', undefined, admin()), e);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.participants.map((p: { clientId: string }) => p.clientId)).toEqual(['b', 'a']);
    expect(body.participants[0]).toEqual({ clientId: 'b', nickname: 'Brave Panda', done: ['who', 'why', 'brief'], buildPromptLength: 500, updatedAt: 20, createdAt: 2 });
    expect(JSON.stringify(body)).not.toContain('canvas');
  });

  it('shows one participant with their canvas, and 404 for a stranger', async () => {
    const { e } = setup();
    const canvas = filledCanvas();
    canvas.chats.who = [{ role: 'user', content: 'Ask me questions about my person and their pain.' }, { role: 'user', content: 'It is for ward 4.' }];
    canvas.meta = { joinedAt: 1000, firstInputAt: 61000 };
    await handle(req('POST', '/api/sync', { code: 'M82T7', clientId: 'client/with spaces', canvas, done: ['who'] }), e);
    const res = await handle(req('GET', `/api/admin/participants/${encodeURIComponent('client/with spaces')}`, undefined, admin()), e);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.participant).toMatchObject({ clientId: 'client/with spaces', nickname: nicknameFor('client/with spaces'), done: ['who'] });
    expect(body.canvas.who.who).toBe('New nurses on night shift');
    expect(body.canvas.chats.who[1].content).toBe('It is for ward 4.');
    expect(body.canvas.meta).toEqual({ joinedAt: 1000, firstInputAt: 61000 });
    expect((await handle(req('GET', '/api/admin/participants/nobody', undefined, admin()), e)).status).toBe(404);
  });

  it('upgrades a participant saved by the first version when the facilitator opens them', async () => {
    const { e, participants } = setup();
    const old = { idea: { who: 'old nurses', oneLine: 'A summary' }, build: { prompt: 'Old prompt', platform: 'codex' }, chats: { idea: [{ role: 'user', content: 'hi' }] } };
    participants.set('old', { client_id: 'old', nickname: 'Old Otter', canvas: JSON.stringify(old), done: '["idea","build"]', build_prompt_length: 10, created_at: 1, updated_at: 2 });
    const body = await json(await handle(req('GET', '/api/admin/participants/old', undefined, admin()), e));
    expect(body.participant.done).toEqual(['who', 'brief']);
    expect(body.canvas.who).toMatchObject({ who: 'old nurses', parkedIdea: 'A summary' });
    expect(body.canvas.brief).toMatchObject({ document: 'Old prompt', platform: 'codex' });
    expect(body.canvas.chats.who).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('reads and changes settings, partial booleans only', async () => {
    const { e } = setup();
    expect(await json(await handle(req('GET', '/api/admin/settings', undefined, admin()), e))).toEqual({ showTimings: false, aiJudge: true, judgeAvailable: false });
    const put = await handle(req('PUT', '/api/admin/settings', { showTimings: true }, admin()), e);
    expect(await json(put)).toEqual({ showTimings: true, aiJudge: true, judgeAvailable: false });
    // Visible to participants too.
    expect(await json(await handle(req('GET', '/api/settings'), e))).toMatchObject({ showTimings: true });
    expect((await handle(req('PUT', '/api/admin/settings', { showTimings: 'yes' }, admin()), e)).status).toBe(400);
    expect((await handle(req('PUT', '/api/admin/settings', { other: true }, admin()), e)).status).toBe(400);
    expect((await handle(req('PUT', '/api/admin/settings', '{oops', admin()), e)).status).toBe(400);
    expect(await json(await handle(req('PUT', '/api/admin/settings', { aiJudge: false }, admin()), e))).toMatchObject({ showTimings: true, aiJudge: false });
  });

  it('clears everyone on DELETE', async () => {
    const { e, participants } = setup();
    await handle(req('POST', '/api/sync', { code: 'M82T7', clientId: 'a', canvas: emptyCanvas(), done: [] }), e);
    await handle(req('POST', '/api/sync', { code: 'M82T7', clientId: 'b', canvas: emptyCanvas(), done: [] }), e);
    const res = await handle(req('DELETE', '/api/admin/participants', undefined, admin()), e);
    expect(await json(res)).toEqual({ deleted: 2 });
    expect(participants.size).toBe(0);
  });

  it('answers 404 for unknown admin routes and methods, 503 without a database', async () => {
    const { e } = setup();
    expect((await handle(req('GET', '/api/admin/nope', undefined, admin()), e)).status).toBe(404);
    expect((await handle(req('POST', '/api/admin/participants', {}, admin()), e)).status).toBe(404);
    expect((await handle(req('GET', '/api/admin/participants', undefined, admin()), env({ ADMIN_PASSWORD: 'pw' }))).status).toBe(503);
  });
});
