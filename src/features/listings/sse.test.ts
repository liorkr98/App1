import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deepseekDelta, splitSse } from './sse.js';

describe('deepseekDelta', () => {
  it('reads a content delta', () => {
    assert.equal(
      deepseekDelta('{"choices":[{"delta":{"content":"שלום"}}]}'),
      'שלום',
    );
  });

  it('ignores [DONE] and empty deltas', () => {
    assert.equal(deepseekDelta('[DONE]'), undefined);
    assert.equal(deepseekDelta('{"choices":[{"delta":{}}]}'), undefined);
  });
});

describe('splitSse', () => {
  it('yields complete events and keeps a partial tail', () => {
    const { events, rest } = splitSse('event: token\ndata: {"t":"א"}\n\nevent: done\ndata: {"text":"');
    assert.equal(events.length, 1);
    assert.equal(events[0]?.event, 'token');
    assert.equal(events[0]?.data, '{"t":"א"}');
    assert.equal(rest.startsWith('event: done'), true);
  });
});
