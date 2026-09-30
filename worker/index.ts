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
import { canvasFromRow, checkAdminAuth, rowToSummary, syncRowFrom } from '../src/shared/admin';
import { DEFAULT_SETTINGS, type ParticipantDetail } from '../src/shared/contracts';
import { stepFingerprint } from '../src/shared/canvas';
import { buildJudgeRequest, interpretJudge } from '../src/shared/judge';
import { buildMessages, maxTokensFor } from '../src/shared/prompts';
import { readSettingsPatch, toPublicSettings } from '../src/shared/settings';
import {
  validateCoachRequest,
  validateJudgeRequest,
  validateSyncRequest,
  type CoachRequest,
} from '../src/shared/validation';
import { codeMatches } from '../src/shared/workshopCode';
import { JevError, askJev } from './jev';
import { UPSTREAM_TIMEOUT_MS, streamChat } from './llm';
import { clearParticipants, getParticipant, listParticipants, readSettings, upsertParticipant, writeSettings } from './store';

export interface Env {
  ASSETS: Fetcher;
  // Secrets (wrangler secret put / .dev.vars).
  WORKSHOP_CODE: string;
  LLM_API_KEY: string;
  // Plain vars (wrangler.jsonc).
  LLM_BASE_URL: string;
  LLM_MODEL: string;
  LLM_REASONING_EFFORT?: string;
  // Optional secrets. Without TYPESAFE_API_KEY the step checker is off; without
  // ADMIN_PASSWORD the admin routes answer 503.
  TYPESAFE_API_KEY?: string;
  ADMIN_PASSWORD?: string;
  // D1: participant progress and settings. Absent, sync and admin answer 503.
  DB?: D1Database;
  // Rate-limit bindings. Optional so tests and misconfigured deploys still run.
  COACH_CLIENT_LIMITER?: Limiter;
  COACH_IP_LIMITER?: Limiter;
  CODE_FAIL_LIMITER?: Limiter;
  JUDGE_CLIENT_LIMITER?: Limiter;
  SYNC_CLIENT_LIMITER?: Limiter;
}

const BAD_CODE = "That code doesn't match. Check the screen and try again.";
const BAD_REQUEST = 'That request could not be read.';
const LLM_FAILED = 'Sorry, the coach could not answer just now. Please try again in a moment.';
const LLM_EMPTY = 'The coach ran out of room before it could answer. Please try again.';
const JUDGE_FAILED = "The step checker couldn't answer just now. Please try again in a moment.";
const JUDGE_OFF = 'The step checker is not switched on.';
const JUDGE_BUSY = 'The step checker needs a breather. Try again in about a minute.';
const SYNC_BUSY = 'Syncing too often. Try again in a moment.';
const SYNC_TOO_BIG = 'That canvas is too large to sync.';
const NO_DB = 'Progress storage is not set up.';
const ADMIN_OFF = 'The admin page is not set up yet.';
const BAD_PASSWORD = "That password doesn't match.";
const MAX_BODY_BYTES = 1_000_000;
const MAX_SYNC_BYTES = 200_000;

const json = (body: unknown, status = 200, headers?: Record<string, string>) => Response.json(body, { status, headers });

const tooManyRequests = (message = RATE_LIMIT_MESSAGE) =>
  json({ error: message }, 429, { 'Retry-After': String(RETRY_AFTER_SECONDS) });

/**
 * Undefined for an empty body, a plain object for good JSON, 'invalid' for
 * anything unreadable and 'too_large' past `maxBytes`.
 */
async function readJsonBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown | 'invalid' | 'too_large'> {
  if (Number(request.headers.get('content-length')) > maxBytes) return 'too_large';
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > maxBytes) return 'too_large';
  const raw = new TextDecoder().decode(buffer);
  if (raw.trim() === '') return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : 'invalid';
  } catch {
    return 'invalid';
  }
}

const bodyProblem = (body: unknown): Response | null =>
  body === 'invalid' || body === 'too_large' ? json({ error: BAD_REQUEST }, 400) : null;

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

const judgeAvailable = (env: Env) => (env.TYPESAFE_API_KEY?.trim() ?? '').length > 0;

async function currentSettings(env: Env) {
  if (!env.DB) return DEFAULT_SETTINGS;
  try {
    return await readSettings(env.DB);
  } catch (error) {
    console.error('[settings] read failed:', error instanceof Error ? error.message : error);
    return DEFAULT_SETTINGS;
  }
}

async function handlePublicSettings(env: Env): Promise<Response> {
  return json(toPublicSettings(await currentSettings(env), judgeAvailable(env)), 200, { 'Cache-Control': 'no-store' });
}

async function handleJudge(request: Request, env: Env, config: Config, ip: string | null): Promise<Response> {
  const body = await readJsonBody(request);
  const problem = bodyProblem(body);
  if (problem) return problem;
  const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
  const rejected = await checkCode(code, config, env, ip);
  if (rejected) return rejected;

  const parsed = validateJudgeRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const apiKey = env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) return json({ error: JUDGE_OFF }, 503);

  const allowed = await takeAll([
    { limiter: env.JUDGE_CLIENT_LIMITER, key: clientKey(parsed.value.clientId) },
    { limiter: env.COACH_IP_LIMITER, key: ipKey(ip) },
  ]);
  if (!allowed) return tooManyRequests(JUDGE_BUSY);

  const { step, canvas, clarifications } = parsed.value;
  try {
    const answers = await askJev(apiKey, buildJudgeRequest(canvas, step, clarifications));
    return json(interpretJudge(step, answers, stepFingerprint(canvas, step), Date.now()));
  } catch (error) {
    console.error('[judge] upstream failed:', error instanceof JevError ? error.message : error);
    return json({ error: JUDGE_FAILED }, 502);
  }
}

async function handleSync(request: Request, env: Env, config: Config, ip: string | null): Promise<Response> {
  const body = await readJsonBody(request, MAX_SYNC_BYTES);
  if (body === 'too_large') return json({ error: SYNC_TOO_BIG }, 413);
  if (body === 'invalid') return json({ error: BAD_REQUEST }, 400);
  const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
  const rejected = await checkCode(code, config, env, ip);
  if (rejected) return rejected;

  const parsed = validateSyncRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  if (!env.DB) return json({ error: NO_DB }, 503);

  if (!(await takeAll([{ limiter: env.SYNC_CLIENT_LIMITER, key: clientKey(parsed.value.clientId) }]))) {
    return tooManyRequests(SYNC_BUSY);
  }
  try {
    await upsertParticipant(env.DB, syncRowFrom(parsed.value, Date.now()));
  } catch (error) {
    console.error('[sync] write failed:', error instanceof Error ? error.message : error);
    return json({ error: NO_DB }, 503);
  }
  return new Response(null, { status: 204 });
}

/** Every /api/admin/* route. Wrong passwords count against the same per-IP limiter as wrong codes. */
async function handleAdmin(request: Request, env: Env, path: string, ip: string | null): Promise<Response> {
  const auth = checkAdminAuth(request.headers.get('Authorization'), env.ADMIN_PASSWORD);
  if (auth === 'unconfigured') return json({ error: ADMIN_OFF }, 503);
  if (auth === 'unauthorised') {
    const allowed = await takeAll([{ limiter: env.CODE_FAIL_LIMITER, key: codeFailKey(ip) }]);
    return allowed ? json({ error: BAD_PASSWORD }, 401) : tooManyRequests();
  }
  const db = env.DB;
  if (!db) return json({ error: NO_DB }, 503);

  try {
    const { method } = request;
    if (path === '/api/admin/participants') {
      if (method === 'GET') return json({ participants: (await listParticipants(db)).map(rowToSummary) });
      if (method === 'DELETE') return json({ deleted: await clearParticipants(db) });
    }

    const one = /^\/api\/admin\/participants\/([^/]+)$/.exec(path);
    if (one && method === 'GET') {
      let clientId: string;
      try {
        clientId = decodeURIComponent(one[1] ?? '');
      } catch {
        return json({ error: BAD_REQUEST }, 400);
      }
      const row = await getParticipant(db, clientId);
      if (!row) return json({ error: 'No such participant.' }, 404);
      const detail: ParticipantDetail = { participant: rowToSummary(row), canvas: canvasFromRow(row.canvas) };
      return json(detail);
    }

    if (path === '/api/admin/settings') {
      if (method === 'GET') return json(toPublicSettings(await readSettings(db), judgeAvailable(env)));
      if (method === 'PUT') {
        const body = await readJsonBody(request);
        const problem = bodyProblem(body);
        if (problem) return problem;
        const patch = readSettingsPatch(body ?? {});
        if (!patch.ok) return json({ error: patch.error }, 400);
        await writeSettings(db, patch.value);
        return json(toPublicSettings(await readSettings(db), judgeAvailable(env)));
      }
    }
  } catch (error) {
    console.error('[admin] failed:', error instanceof Error ? error.message : error);
    return json({ error: 'Something went wrong reading the stored data.' }, 500);
  }

  return json({ error: 'Not found.' }, 404);
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
    const problem = bodyProblem(body);
    if (problem) return problem;
    const code = (body as { code?: unknown } | undefined)?.code;
    return (await checkCode(code, config, env, ip)) ?? json({ ok: true });
  }

  if (request.method === 'POST' && path === '/api/coach') {
    const body = await readJsonBody(request);
    const problem = bodyProblem(body);
    if (problem) return problem;
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

  if (request.method === 'POST' && path === '/api/judge') return handleJudge(request, env, config, ip);
  if (request.method === 'POST' && path === '/api/sync') return handleSync(request, env, config, ip);
  if (request.method === 'GET' && path === '/api/settings') return handlePublicSettings(env);
  if (path.startsWith('/api/admin/')) return handleAdmin(request, env, path, ip);

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
