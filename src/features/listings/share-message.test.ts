import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shareMessage, whatsappShareUrl } from './share-message.js';

const base = {
  title: 'דירת 4 חדרים,\nמשופצת מהיסוד',
  price: '₪1,850,000',
  facts: ['95 מ״ר', 'קומה 3 מתוך 5', 'מעלית'],
  place: 'סוקולוב 42, חולון',
  url: 'https://hasivuv.com/a/A7K2M',
};

describe('the message an agent pastes', () => {
  it('puts the title and price on the first line', () => {
    // The first line is what shows in the chat list before anyone opens it.
    const first = shareMessage(base).split('\n')[0];
    assert.equal(first, 'דירת 4 חדרים, משופצת מהיסוד · ₪1,850,000');
  });

  it('flattens the title, because a two-line title reads as two messages', () => {
    assert.ok(!shareMessage(base).split('\n')[0]?.includes('\n'));
    assert.ok(shareMessage(base).includes('דירת 4 חדרים, משופצת מהיסוד'));
  });

  it('ends with the URL', () => {
    // WhatsApp previews the LAST link in a message, and text after a link is
    // what gets truncated in the chat list.
    const lines = shareMessage(base).split('\n');
    assert.equal(lines[lines.length - 1], base.url);
  });

  it('separates facts with a middle dot, not a comma', () => {
    // The facts are already comma-shaped inside themselves — "קומה 3 מתוך 5" —
    // and two levels of comma read as one flat list.
    assert.ok(shareMessage(base).includes('95 מ״ר · קומה 3 מתוך 5 · מעלית'));
  });

  it('omits the address when the seller hid it', () => {
    const { place: _place, ...withoutPlace } = base;
    const message = shareMessage(withoutPlace);

    assert.ok(!message.includes('סוקולוב'));
    assert.ok(message.endsWith(base.url));
  });

  it('survives a listing with no facts at all', () => {
    // A draft with nothing answered still has to produce something sendable.
    const message = shareMessage({ ...base, facts: [] });

    assert.ok(message.startsWith('דירת 4 חדרים, משופצת מהיסוד · ₪1,850,000'));
    assert.ok(message.endsWith(base.url));
    assert.ok(!message.includes('·\n'));
  });

  it('never leaves a trailing blank line', () => {
    // A trailing newline sends as an empty line in WhatsApp.
    //
    // The third case OMITS place rather than setting it to undefined:
    // exactOptionalPropertyTypes distinguishes the two, and `place?: string`
    // means the key may be absent, not that it may hold undefined.
    const { place: _place, ...withoutPlace } = base;

    for (const input of [base, { ...base, facts: [] }, withoutPlace]) {
      const message = shareMessage(input);
      assert.equal(message, message.trimEnd());
    }
  });
});

describe('the wa.me link', () => {
  it('encodes Hebrew and newlines', () => {
    const url = whatsappShareUrl(shareMessage(base));

    assert.ok(url.startsWith('https://wa.me/?text='));
    assert.ok(url.includes('%0A'), 'newlines should survive as %0A');
    // No raw Hebrew, no raw spaces — both break a URL in a chat.
    assert.ok(!/[֐-׿ ]/.test(url));
  });

  it('round-trips back to exactly the message', () => {
    const message = shareMessage(base);
    const encoded = whatsappShareUrl(message).replace('https://wa.me/?text=', '');

    assert.equal(decodeURIComponent(encoded), message);
  });
});
