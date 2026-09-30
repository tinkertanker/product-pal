import { describe, expect, it } from 'vitest';
import { emptyCanvas } from './canvas';
import { canvasFromRow, checkAdminAuth, constantTimeEqual, rowToSummary, syncRowFrom } from './admin';
import { nicknameFor } from './contracts';

describe('constantTimeEqual', () => {
  it('is true only for identical strings', () => {
    expect(constantTimeEqual('hunter2', 'hunter2')).toBe(true);
    expect(constantTimeEqual('hunter2', 'hunter3')).toBe(false);
    expect(constantTimeEqual('hunter2', 'hunter')).toBe(false);
    expect(constantTimeEqual('', 'x')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
  it('handles non-ASCII text', () => {
    expect(constantTimeEqual('pässword', 'pässword')).toBe(true);
    expect(constantTimeEqual('pässword', 'passwörd')).toBe(false);
  });
});

describe('checkAdminAuth', () => {
  it('accepts the right bearer password', () => {
    expect(checkAdminAuth('Bearer s3cret', 's3cret')).toBe('ok');
    expect(checkAdminAuth('bearer   s3cret ', ' s3cret ')).toBe('ok');
  });
  it('rejects a wrong, missing or malformed header', () => {
    expect(checkAdminAuth('Bearer nope', 's3cret')).toBe('unauthorised');
    expect(checkAdminAuth(null, 's3cret')).toBe('unauthorised');
    expect(checkAdminAuth('s3cret', 's3cret')).toBe('unauthorised');
    expect(checkAdminAuth('Basic s3cret', 's3cret')).toBe('unauthorised');
    expect(checkAdminAuth('Bearer ', 's3cret')).toBe('unauthorised');
  });
  it('says so when no password is configured, whatever is sent', () => {
    expect(checkAdminAuth('Bearer ', undefined)).toBe('unconfigured');
    expect(checkAdminAuth('Bearer x', '')).toBe('unconfigured');
    expect(checkAdminAuth('Bearer x', '   ')).toBe('unconfigured');
  });
});

describe('rows', () => {
  it('turns a sync into the columns to store', () => {
    const canvas = emptyCanvas();
    canvas.build.prompt = '  Build this.  ';
    const row = syncRowFrom({ code: 'x', clientId: 'abc', canvas, done: ['idea', 'why'] }, 99);
    expect(row).toMatchObject({ client_id: 'abc', nickname: nicknameFor('abc'), build_prompt_length: 11, now: 99, done: '["idea","why"]' });
    expect(JSON.parse(row.canvas).build.prompt).toBe('  Build this.  ');
  });
  it('turns a stored row into a summary, dropping junk from done', () => {
    const summary = rowToSummary({
      client_id: 'abc',
      nickname: 'Coral Otter',
      done: '["why","idea","nonsense",5]',
      build_prompt_length: 12,
      created_at: 1,
      updated_at: 2,
    });
    expect(summary).toEqual({ clientId: 'abc', nickname: 'Coral Otter', done: ['idea', 'why'], buildPromptLength: 12, updatedAt: 2, createdAt: 1 });
    expect(rowToSummary({ client_id: 'a', nickname: 'n', done: 'not json', build_prompt_length: 0, created_at: 0, updated_at: 0 }).done).toEqual([]);
  });
  it('reads a stored canvas back, tolerating damage', () => {
    const canvas = emptyCanvas();
    canvas.idea.who = 'nurses';
    expect(canvasFromRow(JSON.stringify(canvas)).idea.who).toBe('nurses');
    expect(canvasFromRow('{oops').idea.who).toBe('');
  });
});
