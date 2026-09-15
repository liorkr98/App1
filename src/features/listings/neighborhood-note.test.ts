import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  acceptNeighborhoodNote,
  buildNeighborhoodPrompt,
  descriptionOrArea,
  groundedAreaDescription,
  isGrounded,
} from './neighborhood-note.js';

const facts = {
  city: 'חולון',
  transit: [{ name: 'וולפסון', walkMinutes: 7, mode: 'light_rail' as const }],
  schools: [{ name: 'גן רימון', walkMinutes: 4 }],
  places: [
    { name: 'שופרסל שלי', walkMinutes: 5, category: 'grocery' as const },
    { name: 'פארק פרס', walkMinutes: 9, category: 'park' as const },
  ],
  civic: [{ name: 'חניה ציבורית, חולון', walkMinutes: 4, kind: 'parking' as const }],
};

describe('buildNeighborhoodPrompt', () => {
  it('lists names and minutes and never a coordinate or a guessed population', () => {
    const prompt = buildNeighborhoodPrompt(facts);
    assert.match(prompt, /חולון/);
    assert.match(prompt, /וולפסון \(7 דקות הליכה\)/);
    assert.match(prompt, /גן רימון/);
    assert.match(prompt, /פארק פרס/);
    assert.doesNotMatch(prompt, /32\.|34\.|lat|lng/i);
    assert.doesNotMatch(prompt, /תושב/);
  });
});

describe('groundedAreaDescription', () => {
  it('names the school and the rail and omits what is missing', () => {
    const text = groundedAreaDescription(facts);
    assert.match(text, /חולון/);
    assert.match(text, /וולפסון/);
    assert.match(text, /גן רימון/);
    assert.match(text, /פארק פרס/);
    assert.doesNotMatch(text, /אין /);
    assert.doesNotMatch(text, /תושב/);
  });

  it('prefers the light rail over a nearer bus', () => {
    const text = groundedAreaDescription({
      ...facts,
      transit: [
        { name: 'סוקולוב/ההסתדרות', walkMinutes: 3, mode: 'bus' },
        { name: 'וולפסון', walkMinutes: 7, mode: 'light_rail' },
      ],
    });
    assert.match(text, /וולפסון/);
    assert.match(text, /סוקולוב/);
  });

  it('does not write police into the description', () => {
    const text = groundedAreaDescription({
      ...facts,
      civic: [{ name: 'תחנת חולון', walkMinutes: 12, kind: 'police' }],
    });
    assert.doesNotMatch(text, /תחנת חולון/);
  });
});

describe('isGrounded', () => {
  it('rejects an invented population and a school we do not have', () => {
    assert.equal(isGrounded('בחולון גרים 12000 תושבים ליד וולפסון.', facts), false);
    assert.equal(isGrounded('בית ספר גפן דקה אחת ברגל.', facts), false);
  });
});

describe('acceptNeighborhoodNote', () => {
  it('keeps a short factual Hebrew paragraph that cites the lists', () => {
    const note = acceptNeighborhoodNote(
      'בחולון. הרכבת הקלה בוולפסון כ־7 דקות הליכה, וגן רימון 4 דקות. שופרסל שלי ופארק פרס במרחק הליכה.',
      facts,
    );
    assert.ok(note);
    assert.match(note.text, /וולפסון/);
  });

  it('drops a valuation, a negative, and an English-only reply', () => {
    assert.equal(acceptNeighborhoodNote('הדירה בשווי גבוה וכדאי לקנות.', facts), undefined);
    assert.equal(acceptNeighborhoodNote('אין פארק ואין רכבת.', facts), undefined);
    assert.equal(acceptNeighborhoodNote('Great investment opportunity nearby.', facts), undefined);
  });

  it('accepts the deterministic fallback', () => {
    const text = groundedAreaDescription(facts);
    const note = acceptNeighborhoodNote(text, facts);
    assert.ok(note);
  });
});

describe('descriptionOrArea', () => {
  it('keeps a seller-written description and fills an empty one from the note', () => {
    assert.equal(descriptionOrArea('כתבתי בעצמי.', { text: 'בחולון.' }), 'כתבתי בעצמי.');
    assert.equal(descriptionOrArea('  ', { text: 'בחולון, ליד וולפסון.' }), 'בחולון, ליד וולפסון.');
  });
});
