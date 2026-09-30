// Parsing an OpenAI-compatible server-sent event stream. Pure string handling.

/**
 * Split a buffer into complete SSE events. Returns the data payload of each
 * event and whatever is left over (an incomplete event) for the next chunk.
 */
export function splitSse(buffer: string): { events: string[]; rest: string } {
  const normalised = buffer.replace(/\r\n/g, '\n');
  const parts = normalised.split('\n\n');
  const rest = parts.pop() ?? '';
  const events: string[] = [];
  for (const part of parts) {
    const data = part
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (data) events.push(data);
  }
  return { events, rest };
}

export type Delta = { content: string; done: boolean; truncated?: boolean };

/**
 * Read one event's data. Only `delta.content` is forwarded; DeepSeek's
 * `reasoning_content` is dropped on purpose.
 */
export function parseDelta(data: string): Delta {
  if (data.trim() === '[DONE]') return { content: '', done: true };
  try {
    const json = JSON.parse(data) as { choices?: { delta?: { content?: unknown }; finish_reason?: unknown }[] };
    const content = json.choices?.[0]?.delta?.content;
    const delta: Delta = { content: typeof content === 'string' ? content : '', done: false };
    // Reasoning models spend tokens thinking, so a long reply can hit the cap.
    if (json.choices?.[0]?.finish_reason === 'length') delta.truncated = true;
    return delta;
  } catch {
    return { content: '', done: false };
  }
}
