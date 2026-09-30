import { describe, expect, it } from 'vitest';
import { parseDelta, splitSse } from './sse';

describe('splitSse', () => {
  it('returns complete events and keeps the remainder', () => {
    const { events, rest } = splitSse('data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c"');
    expect(events).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('data: {"c"');
  });
  it('handles CRLF and comment lines', () => {
    const { events } = splitSse(': keep-alive\r\n\r\ndata: hello\r\n\r\n');
    expect(events).toEqual(['hello']);
  });
});

describe('parseDelta', () => {
  it('flags a reply cut off by the token cap', () => {
    expect(parseDelta('{"choices":[{"delta":{"content":""},"finish_reason":"length"}]}')).toEqual({ content: '', done: false, truncated: true });
  });
  it('forwards content', () => {
    expect(parseDelta('{"choices":[{"delta":{"content":"Hi"}}]}')).toEqual({ content: 'Hi', done: false });
  });
  it('drops reasoning_content', () => {
    expect(parseDelta('{"choices":[{"delta":{"reasoning_content":"thinking","content":null}}]}').content).toBe('');
  });
  it('recognises the end marker and ignores junk', () => {
    expect(parseDelta('[DONE]').done).toBe(true);
    expect(parseDelta('not json')).toEqual({ content: '', done: false });
    expect(parseDelta('{"choices":[]}').content).toBe('');
  });
});
