import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  acceptNeighborhoodNote,
  buildNeighborhoodPrompt,
} from './neighborhood-note.js';

const facts = {
  city: 'חולון',
  transit: [{ name: 'וולפסון', walkMinutes: 7, mode: 'light_rail' as const }],
  schools: [{ name: 'גן רימון', walkMinutes: 4 }],
  places: [{ name: 'שופרסל שלי', walkMinutes: 5, category: 'grocery' as const }],
  civic: [{ name: 'תחנת חולון', walkMinutes: 12, kind: 'police' as const }],
};

describe('buildNeighborhoodPrompt', () => {
  it('lists names and minutes and never a coordinate', () => {
    const prompt = buildNeighborhoodPrompt(facts);
    assert.match(prompt, /חולון/);
    assert.match(prompt, /וולפסון \(7 דקות הליכה\)/);
    assert.match(prompt, /גן רימון/);
    assert.doesNotMatch(prompt, /32\.|34\.|lat|lng/i);
  });
});

describe('acceptNeighborhoodNote', () => {
  it('keeps a short factual Hebrew paragraph', () => {
    const note = acceptNeighborhoodNote(
      'בחולון, ליד סוקולוב. הרכבת הקלה בוולפסון כשבע דקות הליכה, וגן רימון כארבע. שופרסל שלי חמש דקות ברגל.',
    );
    assert.ok(note);
    assert.match(note.text, /וולפסון/);
  });

  it('drops a valuation and an English-only reply', () => {
    assert.equal(acceptNeighborhoodNote('הדירה בשווי גבוה וכדאי לקנות.'), undefined);
    assert.equal(acceptNeighborhoodNote('Great investment opportunity nearby.'), undefined);
    assert.equal(acceptNeighborhoodNote('see https://example.com for more'), undefined);
  });
});
