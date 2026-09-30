// HTTP routes. Thin: parse, call the pure core, stream the result.

import express, { type Request, type Response } from 'express';
import { buildMessages, maxTokensFor } from '../src/shared/prompts';
import { RateLimiter, codeFailureRules, coachRules, retryMessage } from '../src/shared/rateLimit';
import { validateCoachRequest } from '../src/shared/validation';
import { codeMatches } from '../src/shared/workshopCode';
import type { Config } from './config';
import { UPSTREAM_TIMEOUT_MS, streamChat } from './llm';

const BAD_CODE = "That code doesn't match. Check the screen and try again.";
const LLM_FAILED = 'Sorry, the coach could not answer just now. Please try again in a moment.';
const LLM_EMPTY = 'The coach ran out of room before it could answer. Please try again.';

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function createApi(config: Config): express.Router {
  const router = express.Router();
  const limiter = new RateLimiter();
  setInterval(() => limiter.prune(Date.now(), 10 * 60 * 1000), 60_000).unref();

  router.use(express.json({ limit: '1mb' }));

  /**
   * Check a code. Wrong guesses are counted per IP; once an IP has made too
   * many, even a right code is refused for a while.
   */
  function checkCode(req: Request, res: Response, code: unknown): boolean {
    const rules = codeFailureRules(clientIp(req));
    const blocked = limiter.peek(rules, Date.now());
    if (!blocked.allowed) {
      res.status(429).json({ error: retryMessage(blocked.retryAfterMs) });
      return false;
    }
    if (codeMatches(code, config.codes)) return true;
    limiter.take(rules, Date.now());
    res.status(401).json({ error: BAD_CODE });
    return false;
  }

  router.get('/health', (_req, res) => {
    res.json({ ok: true, model: config.llm.model });
  });

  router.post('/join', (req, res) => {
    const code = (req.body as { code?: unknown } | undefined)?.code;
    if (!checkCode(req, res, code)) return;
    res.json({ ok: true });
  });

  router.post('/coach', async (req, res) => {
    const body: unknown = req.body;
    const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
    if (!checkCode(req, res, code)) return;

    const parsed = validateCoachRequest(body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const request = parsed.value;

    const taken = limiter.take(coachRules(request.clientId, clientIp(req)), Date.now());
    if (!taken.allowed) {
      res.status(429).setHeader('Retry-After', String(Math.ceil(taken.retryAfterMs / 1000)));
      res.json({ error: retryMessage(taken.retryAfterMs) });
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('timeout')), UPSTREAM_TIMEOUT_MS);
    res.on('close', () => {
      if (!res.writableEnded) controller.abort(new Error('client closed'));
    });

    let wrote = false;
    try {
      const messages = buildMessages(request);
      for await (const text of streamChat(config.llm, messages, maxTokensFor(request.mode), controller.signal)) {
        wrote = true;
        res.write(text);
      }
      if (!wrote) res.write(LLM_EMPTY);
    } catch (error) {
      if (!res.writableEnded && !res.destroyed) {
        console.error('[coach] upstream failed:', error instanceof Error ? error.message : error);
        res.write(wrote ? `\n\n${LLM_FAILED}` : LLM_FAILED);
      }
    } finally {
      clearTimeout(timeout);
      if (!res.writableEnded) res.end();
    }
  });

  router.use((_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  // Malformed or oversized JSON bodies end up here.
  router.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : 400;
    res.status(status >= 400 && status < 500 ? status : 400).json({ error: 'That request could not be read.' });
  });

  return router;
}
