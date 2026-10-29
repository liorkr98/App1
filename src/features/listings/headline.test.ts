import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { answer, blankFacts } from './fact-entry.js';
import { acceptHeadline, HEADLINE_SYSTEM_PROMPT, LINE_MAX, TITLE_MAX } from './headline.js';
import type { ListingCopyInput } from './listing-copy.js';

const input: ListingCopyInput = {
  category: 'property',
  facts: answer(answer(blankFacts('property'), 'rooms', 4), 'floor', 3),
  city: 'חיפה',
};

const reply = (title: unknown, line: unknown) => JSON.stringify({ title, line });

describe('acceptHeadline — the title and the WhatsApp line (18 Oct 2026)', () => {
  it('keeps a title and a line made of the facts', () => {
    assert.deepEqual(acceptHeadline(reply('דירת 4 חדרים בחיפה', 'קומה 3, מוארת ומרווחת.'), input), {
      title: 'דירת 4 חדרים בחיפה',
      line: 'קומה 3, מוארת ומרווחת.',
    });
  });

  it('drops a part with a number the facts do not hold, and keeps the other', () => {
    assert.deepEqual(acceptHeadline(reply('דירת 4 חדרים ברחוב הרצל 12', 'קומה 3, מוארת ומרווחת.'), input), {
      line: 'קומה 3, מוארת ומרווחת.',
    });
  });

  it('refuses a link, a superlative, a model name, two lines, or too long', () => {
    for (const bad of [
      'דירה בחיפה https://example.com',
      'דירה מדהימה בחיפה',
      'כתב DeepSeek דירה בחיפה',
      'דירה בחיפה\nעוד שורה',
      'א'.repeat(TITLE_MAX + 1),
    ]) {
      assert.deepEqual(acceptHeadline(reply(bad, null), input), {}, bad);
    }
    assert.deepEqual(acceptHeadline(reply(null, 'ב'.repeat(LINE_MAX + 1)), input), {});
  });

  it('mends a gershayim typed as a quote mark', () => {
    assert.equal(acceptHeadline(reply('דירה עם ממ"ד בחיפה', null), input).title, 'דירה עם ממ״ד בחיפה');
  });

  it('is nothing at all when the answer is not json', () => {
    assert.deepEqual(acceptHeadline('דירה יפה', input), {});
  });

  it('asks for json, as the API requires', () => {
    assert.match(HEADLINE_SYSTEM_PROMPT, /json/);
  });
});
