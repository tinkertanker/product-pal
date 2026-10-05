import { afterEach, describe, expect, it, vi } from 'vitest';
import { parsePublicSettings, requestJudgement, streamCoach, UnauthorisedError, type CoachBody } from './api';
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
