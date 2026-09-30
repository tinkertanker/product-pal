// The one place that talks to the LLM. Streams `delta.content` only.

import { parseDelta, splitSse } from '../src/shared/sse';
import type { Message } from '../src/shared/prompts';
import type { Config } from './config';

export const UPSTREAM_TIMEOUT_MS = 90_000;

export const TRUNCATED_NOTE = '\n\n_(The coach ran out of room here. Ask it to carry on.)_';

export class UpstreamError extends Error {}

export async function* streamChat(
  llm: Config['llm'],
  messages: Message[],
  maxTokens: number,
  signal: AbortSignal,
): AsyncGenerator<string> {
  if (!llm.baseUrl || !llm.apiKey || !llm.model) throw new UpstreamError('The coach is not configured.');

  const body: Record<string, unknown> = {
    model: llm.model,
    messages,
    stream: true,
    max_tokens: maxTokens,
  };
  if (llm.reasoningEffort) body.reasoning_effort = llm.reasoningEffort;

  const response = await fetch(`${llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llm.apiKey}` },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new UpstreamError(`Upstream returned ${response.status}. ${detail.slice(0, 300)}`);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const { events, rest } = splitSse(buffer);
    buffer = rest;
    for (const data of events) {
      const delta = parseDelta(data);
      if (delta.done) return;
      if (delta.content) yield delta.content;
      if (delta.truncated) yield TRUNCATED_NOTE;
    }
  }
  // Flush a final event that had no trailing blank line.
  const tail = splitSse(buffer + '\n\n');
  for (const data of tail.events) {
    const delta = parseDelta(data);
    if (delta.content) yield delta.content;
  }
}
