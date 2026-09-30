import { afterEach, describe, expect, it, vi } from 'vitest';
import { handle, type Env } from './index';
import { emptyCanvas } from '../src/shared/canvas';
import { END_MARK, endMarker } from '../src/shared/coachStream';

const env = (over: Partial<Env> = {}): Env => ({
  ASSETS: { fetch: async () => new Response('asset') } as unknown as Fetcher,
  WORKSHOP_CODE: 'M82T7, spare1',
  LLM_API_KEY: 'test-key',
  LLM_BASE_URL: 'https://llm.example.com',
  LLM_MODEL: 'test-model',
  ...over,
});

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://x.test${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const coachBody = (over: Record<string, unknown> = {}) => ({
  code: 'm82t7',
  clientId: 'client-1',
  mode: 'challenge',
  step: 'idea',
  canvas: emptyCanvas(),
  ...over,
});

const sse = (...events: string[]) =>
  new Response(events.map((e) => `data: ${e}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } });

afterEach(() => vi.unstubAllGlobals());

describe('routes', () => {
  it('answers /api/health', async () => {
    const res = await handle(new Request('https://x.test/api/health'), env());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, model: 'test-model' });
  });

  it('sends everything else to static assets', async () => {
    const res = await handle(new Request('https://x.test/some/page'), env());
    expect(await res.text()).toBe('asset');
  });

  it('returns JSON 404 for unknown API routes and wrong methods', async () => {
    expect((await handle(new Request('https://x.test/api/nope'), env())).status).toBe(404);
    expect((await handle(new Request('https://x.test/api/coach'), env())).status).toBe(404);
  });
});

describe('/api/join', () => {
  it('accepts a right code, ignoring case and spaces', async () => {
    expect((await handle(post('/api/join', { code: ' m82t7 ' }), env())).status).toBe(200);
  });
  it('rejects a wrong or missing code with 401', async () => {
    expect((await handle(post('/api/join', { code: 'nope' }), env())).status).toBe(401);
    expect((await handle(post('/api/join', {}), env())).status).toBe(401);
  });
  it('rejects unreadable JSON with 400', async () => {
    expect((await handle(post('/api/join', '{oops'), env())).status).toBe(400);
  });
  it('answers 429 once the wrong-code limiter says no', async () => {
    const CODE_FAIL_LIMITER = { limit: async () => ({ success: false }) };
    expect((await handle(post('/api/join', { code: 'nope' }), env({ CODE_FAIL_LIMITER }))).status).toBe(429);
  });
});

describe('/api/coach', () => {
  it('needs a code, then a valid request', async () => {
    expect((await handle(post('/api/coach', coachBody({ code: 'bad' })), env())).status).toBe(401);
    const res = await handle(post('/api/coach', coachBody({ mode: 'dance' })), env());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown mode.' });
  });

  it('streams only delta.content, then an end marker', async () => {
    const fetchMock = vi.fn(async () =>
      sse(
        JSON.stringify({ choices: [{ delta: { reasoning_content: 'thinking' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'Hello ' } }] }),
        JSON.stringify({ choices: [{ delta: { content: 'there' } }] }),
        '[DONE]',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await handle(post('/api/coach', coachBody()), env());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toBe(`Hello there${endMarker('ok')}`);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://llm.example.com/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
  });

  it('marks a reply that hit the token cap, without adding text', async () => {
    vi.stubGlobal('fetch', async () =>
      sse(JSON.stringify({ choices: [{ delta: { content: 'Hello' }, finish_reason: 'length' }] }), '[DONE]'),
    );
    const text = await (await handle(post('/api/coach', coachBody()), env())).text();
    expect(text).toBe(`Hello${endMarker('truncated')}`);
  });

  it('strips the end marker from model text', async () => {
    vi.stubGlobal('fetch', async () => sse(JSON.stringify({ choices: [{ delta: { content: `a${END_MARK}b` } }] }), '[DONE]'));
    expect(await (await handle(post('/api/coach', coachBody()), env())).text()).toBe(`ab${endMarker('ok')}`);
  });

  it('answers with an error status when the upstream fails or is empty', async () => {
    vi.stubGlobal('fetch', async () => new Response('bad', { status: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const failed = await handle(post('/api/coach', coachBody()), env());
    expect(failed.status).toBe(502);
    expect(((await failed.json()) as { error: string }).error).toContain('could not answer');
    vi.stubGlobal('fetch', async () => sse('[DONE]'));
    const empty = await handle(post('/api/coach', coachBody()), env());
    expect(empty.status).toBe(502);
    expect(((await empty.json()) as { error: string }).error).toContain('ran out of room before');
  });

  it('marks a reply that breaks off partway, without adding error text', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const encoder = new TextEncoder();
    vi.stubGlobal('fetch', async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(out) {
            out.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Half a ' } }] })}\n\n`));
          },
          pull(out) {
            out.error(new Error('connection reset'));
          },
        }),
      ),
    );
    const res = await handle(post('/api/coach', coachBody()), env());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`Half a ${endMarker('failed')}`);
  });

  it('limits by client id and IP, and works without bindings', async () => {
    vi.stubGlobal('fetch', async () => sse(JSON.stringify({ choices: [{ delta: { content: 'Hi' } }] }), '[DONE]'));
    const seen: string[] = [];
    const limiter = (ok: boolean) => ({ limit: async ({ key }: { key: string }) => (seen.push(key), { success: ok }) });
    const headers = { 'CF-Connecting-IP': '9.9.9.9' };
    const ok = await handle(
      post('/api/coach', coachBody(), headers),
      env({ COACH_CLIENT_LIMITER: limiter(true), COACH_IP_LIMITER: limiter(true) }),
    );
    expect(ok.status).toBe(200);
    expect(seen).toEqual(['client:client-1', 'ip:9.9.9.9']);
    const denied = await handle(post('/api/coach', coachBody()), env({ COACH_CLIENT_LIMITER: limiter(false) }));
    expect(denied.status).toBe(429);
    expect(denied.headers.get('retry-after')).toBe('60');
    expect((await handle(post('/api/coach', coachBody()), env())).status).toBe(200);
  });
});
