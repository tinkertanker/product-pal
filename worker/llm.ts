// The one place that talks to the LLM. Streams `delta.content` only.

import type { Message } from '../src/shared/prompts';
import type { Config } from '../src/shared/config';
import { parseDelta, splitSse } from '../src/shared/sse';

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

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
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
    for (const data of splitSse(buffer + '\n\n').events) {
      const delta = parseDelta(data);
      if (delta.content) yield delta.content;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}
