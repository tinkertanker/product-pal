// Cloudflare Worker entry. Thin shell: parse, call the pure core in src/shared,
// stream the result. Anything that is not /api/* is served as static assets.

import { cleanChunk, endMarker, type StreamEnd } from '../src/shared/coachStream';
import { configFromEnv, configWarnings, type Config } from '../src/shared/config';
import {
  RATE_LIMIT_MESSAGE,
  RETRY_AFTER_SECONDS,
  clientKey,
  codeFailKey,
  ipKey,
  takeAll,
  type Limiter,
} from '../src/shared/limits';
import { buildMessages, maxTokensFor } from '../src/shared/prompts';
import { validateCoachRequest, type CoachRequest } from '../src/shared/validation';
import { codeMatches } from '../src/shared/workshopCode';
import { UPSTREAM_TIMEOUT_MS, streamChat } from './llm';

export interface Env {
  ASSETS: Fetcher;
  // Secrets (wrangler secret put / .dev.vars).
  WORKSHOP_CODE: string;
  LLM_API_KEY: string;
  // Plain vars (wrangler.jsonc).
  LLM_BASE_URL: string;
  LLM_MODEL: string;
  LLM_REASONING_EFFORT?: string;
  // Rate-limit bindings. Optional so tests and misconfigured deploys still run.
  COACH_CLIENT_LIMITER?: Limiter;
  COACH_IP_LIMITER?: Limiter;
  CODE_FAIL_LIMITER?: Limiter;
}

const BAD_CODE = "That code doesn't match. Check the screen and try again.";
const BAD_REQUEST = 'That request could not be read.';
const LLM_FAILED = 'Sorry, the coach could not answer just now. Please try again in a moment.';
const LLM_EMPTY = 'The coach ran out of room before it could answer. Please try again.';
const MAX_BODY_BYTES = 1_000_000;

const json = (body: unknown, status = 200, headers?: Record<string, string>) => Response.json(body, { status, headers });

const tooManyRequests = () =>
  json({ error: RATE_LIMIT_MESSAGE }, 429, { 'Retry-After': String(RETRY_AFTER_SECONDS) });

/** Undefined for an empty body, a plain object for good JSON, and 'invalid' otherwise. */
async function readJsonBody(request: Request): Promise<unknown | 'invalid'> {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return 'invalid';
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return 'invalid';
  if (raw.trim() === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : 'invalid';
  } catch {
    return 'invalid';
  }
}

/**
 * Check a code. Wrong guesses are counted per IP; once an IP has made too many,
 * further wrong guesses get a 429 instead of a 401.
 */
async function checkCode(code: unknown, config: Config, env: Env, ip: string | null): Promise<Response | null> {
  if (codeMatches(code, config.codes)) return null;
  const allowed = await takeAll([{ limiter: env.CODE_FAIL_LIMITER, key: codeFailKey(ip) }]);
  return allowed ? json({ error: BAD_CODE }, 401) : tooManyRequests();
}

/**
 * Wait for the first words before answering, so a reply that fails or comes
 * back empty gets an error status. After that, stream the text and end with
 * a marker saying whether it finished, ran out of room or broke off.
 */
async function streamReply(request: CoachRequest, config: Config): Promise<Response> {
  const encoder = new TextEncoder();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), UPSTREAM_TIMEOUT_MS);
  const chunks = streamChat(config.llm, buildMessages(request), maxTokensFor(request.mode), controller.signal);
  const logFailure = (error: unknown) => console.error('[coach] upstream failed:', error instanceof Error ? error.message : error);

  let first: Awaited<ReturnType<typeof chunks.next>>;
  try {
    first = await chunks.next();
  } catch (error) {
    clearTimeout(timeout);
    logFailure(error);
    return json({ error: LLM_FAILED }, 502);
  }
  if (first.done) {
    clearTimeout(timeout);
    return json({ error: LLM_EMPTY }, 502);
  }
  const firstText = first.value;

  const body = new ReadableStream<Uint8Array>({
    start(out) {
      out.enqueue(encoder.encode(cleanChunk(firstText)));
    },
    async pull(out) {
      let end: StreamEnd;
      try {
        const next = await chunks.next();
        if (!next.done) {
          out.enqueue(encoder.encode(cleanChunk(next.value)));
          return;
        }
        end = next.value.truncated ? 'truncated' : 'ok';
      } catch (error) {
        logFailure(error);
        end = 'failed';
      }
      clearTimeout(timeout);
      out.enqueue(encoder.encode(endMarker(end)));
      out.close();
    },
    cancel() {
      clearTimeout(timeout);
      controller.abort(new Error('client closed'));
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

let warned = false;

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  const config = configFromEnv(env);
  if (!warned) {
    warned = true;
    for (const warning of configWarnings(config)) console.warn(warning);
  }
  const ip = request.headers.get('CF-Connecting-IP');

  if (request.method === 'GET' && path === '/api/health') return json({ ok: true, model: config.llm.model });

  if (request.method === 'POST' && path === '/api/join') {
    const body = await readJsonBody(request);
    if (body === 'invalid') return json({ error: BAD_REQUEST }, 400);
    const code = (body as { code?: unknown } | undefined)?.code;
    return (await checkCode(code, config, env, ip)) ?? json({ ok: true });
  }

  if (request.method === 'POST' && path === '/api/coach') {
    const body = await readJsonBody(request);
    if (body === 'invalid') return json({ error: BAD_REQUEST }, 400);
    const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
    const rejected = await checkCode(code, config, env, ip);
    if (rejected) return rejected;

    const parsed = validateCoachRequest(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);

    const allowed = await takeAll([
      { limiter: env.COACH_CLIENT_LIMITER, key: clientKey(parsed.value.clientId) },
      { limiter: env.COACH_IP_LIMITER, key: ipKey(ip) },
    ]);
    return allowed ? streamReply(parsed.value, config) : tooManyRequests();
  }

  return json({ error: 'Not found.' }, 404);
}

export function handle(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/api' || pathname.startsWith('/api/')) return handleApi(request, env, pathname);
  return env.ASSETS.fetch(request);
}

export default {
  fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<Env>;
