import { afterEach, describe, expect, it, vi } from 'vitest';
import { COACH_FIRST_BYTE_MS, COACH_IDLE_MS, parsePublicSettings, requestJudgement, streamCoach, UnauthorisedError, type CoachBody } from './api';
import { endMarker } from './shared/coachStream';
import { emptyCanvas } from './shared/canvas';

const body: CoachBody = { code: 'M82T7', clientId: 'c', mode: 'brief', canvas: emptyCanvas() };

/** A text response sent in the given pieces. */
const streamed = (...pieces: string[]) => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(out) {
        for (const piece of pieces) out.enqueue(encoder.encode(piece));
        out.close();
      },
    }),
  );
};

const run = async (response: Response) => {
  vi.stubGlobal('fetch', async () => response);
  const seen: string[] = [];
  const result = streamCoach(body, (t) => seen.push(t), new AbortController().signal);
  return { result, seen };
};

afterEach(() => vi.unstubAllGlobals());

describe('streamCoach', () => {
  it('returns the reply without the end marker', async () => {
    const { result, seen } = await run(streamed('Hello ', 'there', endMarker('ok')));
    expect(await result).toEqual({ text: 'Hello there', truncated: false });
    expect(seen).toEqual(['Hello ', 'Hello there']);
  });

  it('keeps a truncated reply and says so', async () => {
    const { result } = await run(streamed('Hello', endMarker('truncated')));
    expect(await result).toEqual({ text: 'Hello', truncated: true });
  });

  it('throws when the reply breaks off, even after some text', async () => {
    const { result, seen } = await run(streamed('Half a ', endMarker('failed')));
    await expect(result).rejects.toThrow('stopped partway');
    expect(seen.join('')).not.toContain('\u001e');
  });

  it('throws when the stream ends with no marker', async () => {
    const { result } = await run(streamed('Half a '));
    await expect(result).rejects.toThrow('stopped partway');
  });

  it('throws the server message for an error status', async () => {
    const { result } = await run(Response.json({ error: 'Sorry, the coach could not answer just now.' }, { status: 502 }));
    await expect(result).rejects.toThrow('could not answer');
  });
});

describe('streamCoach timeouts', () => {
  afterEach(() => vi.useRealTimers());

  /** A response whose body the test feeds by hand. */
  const manual = () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
    return { response: new Response(stream), controller };
  };
  const encoder = new TextEncoder();

  it('gives up if nothing arrives for a minute after the first bytes', async () => {
    vi.useFakeTimers();
    const { response, controller } = manual();
    vi.stubGlobal('fetch', async () => response);
    const result = streamCoach(body, () => undefined, new AbortController().signal);
    const caught = expect(result).rejects.toThrow('stopped partway');
    await vi.advanceTimersByTimeAsync(10);
    controller.enqueue(encoder.encode('Hello'));
    await vi.advanceTimersByTimeAsync(COACH_IDLE_MS - 1);
    controller.enqueue(encoder.encode(' there'));
    await vi.advanceTimersByTimeAsync(COACH_IDLE_MS - 1);
    await vi.advanceTimersByTimeAsync(2);
    await caught;
  });

  it('waits longer for the first bytes than between chunks', async () => {
    vi.useFakeTimers();
    const { response, controller } = manual();
    vi.stubGlobal('fetch', async () => response);
    const seen: string[] = [];
    const result = streamCoach(body, (t) => seen.push(t), new AbortController().signal);
    await vi.advanceTimersByTimeAsync(COACH_FIRST_BYTE_MS - 1);
    controller.enqueue(encoder.encode('Late start' + endMarker('ok')));
    controller.close();
    expect(await result).toEqual({ text: 'Late start', truncated: false });
  });

  it('gives up if the server never answers', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
    );
    const caught = expect(streamCoach(body, () => undefined, new AbortController().signal)).rejects.toThrow('stopped partway');
    await vi.advanceTimersByTimeAsync(COACH_FIRST_BYTE_MS + 1);
    await caught;
  });

  it('passes an abort from the caller through untouched', async () => {
    const { response } = manual();
    vi.stubGlobal('fetch', async () => response);
    const controller = new AbortController();
    const result = streamCoach(body, () => undefined, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('parsePublicSettings', () => {
  it('accepts a complete settings object and drops anything extra', () => {
    expect(parsePublicSettings({ showTimings: true, aiJudge: false, judgeAvailable: true, extra: 1 })).toEqual({ showTimings: true, aiJudge: false, judgeAvailable: true });
  });
  it('rejects anything incomplete or of the wrong type', () => {
    expect(parsePublicSettings(null)).toBeNull();
    expect(parsePublicSettings('x')).toBeNull();
    expect(parsePublicSettings({ showTimings: true, aiJudge: 'yes', judgeAvailable: true })).toBeNull();
    expect(parsePublicSettings({ showTimings: true, aiJudge: true })).toBeNull();
  });
});

describe('requestJudgement', () => {
  const request = { code: 'M82T7', clientId: 'c', step: 'who', canvas: emptyCanvas() } as const;
  const reply = (status: number, json: unknown) => vi.stubGlobal('fetch', async () => new Response(JSON.stringify(json), { status }));
  const judgement = { step: 'who', pass: true, checks: [], fingerprint: 'abc', at: 1 };

  it('returns the judgement', async () => {
    reply(200, judgement);
    await expect(requestJudgement(request)).resolves.toEqual(judgement);
  });
  it('raises UnauthorisedError on 401', async () => {
    reply(401, { error: 'no' });
    await expect(requestJudgement(request)).rejects.toBeInstanceOf(UnauthorisedError);
  });
  it("shows the server's message on other errors", async () => {
    reply(502, { error: 'The step checker is resting.' });
    await expect(requestJudgement(request)).rejects.toThrow('The step checker is resting.');
  });
  it('rejects a reply that is not a judgement', async () => {
    reply(200, { nope: true });
    await expect(requestJudgement(request)).rejects.toThrow(/couldn't answer/);
  });
});

describe('syncOutcome', () => {
  it('retries passing failures and gives up on refusals', async () => {
    const { syncOutcome } = await import('./api');
    expect(syncOutcome(204)).toBe('saved');
    expect(syncOutcome(500)).toBe('retry');
    expect(syncOutcome(503)).toBe('retry');
    expect(syncOutcome(429)).toBe('retry');
    expect(syncOutcome(401)).toBe('refused');
    expect(syncOutcome(413)).toBe('refused');
  });
});
