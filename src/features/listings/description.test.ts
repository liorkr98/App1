import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Fact } from '../../types/listing.js';
import {
  BANNED_SUPERLATIVES,
  buildPrompt,
  findBannedWords,
  findReservedTopics,
  findUnsupportedNumbers,
  isUnedited,
  reviewDescription,
} from './description.js';

const fact = (key: string, label: string, value: Fact['value'], extra: Partial<Fact> = {}): Fact => ({
  key,
  label,
  value,
  type: 'text',
  present: true,
  required: false,
  source: 'seller',
  ...extra,
});

const FACTS: Fact[] = [
  fact('rooms', 'חדרים', 4, { type: 'number' }),
  fact('area_sqm', 'מ״ר', 95, { type: 'number', unit: 'מ״ר' }),
  fact('floor', 'קומה', 3, { type: 'number' }),
  fact('elevator', 'מעלית', true, { type: 'boolean' }),
  fact('storage', 'מחסן', null, { present: false }),
  fact('parking', 'חניה', null),
];

describe('buildPrompt', () => {
  it('includes only facts that were actually answered', () => {
    const prompt = buildPrompt({ categoryLabel: 'דירה', facts: FACTS });

    assert.match(prompt, /חדרים: 4/);
    assert.match(prompt, /מ״ר: 95/);

    // present:false is "confirmed absent" and value:null is "unanswered".
    // Neither is something to write a sentence about.
    assert.doesNotMatch(prompt, /מחסן/);
    assert.doesNotMatch(prompt, /חניה/);
  });

  it('marks verified facts so the model knows what is backed', () => {
    const prompt = buildPrompt({
      categoryLabel: 'רכב',
      facts: [fact('make', 'יצרן', 'מאזדה', { source: 'verified' })],
    });

    assert.match(prompt, /יצרן: מאזדה \(מאומת\)/);
  });

  it('carries the rules that keep the output honest', () => {
    const prompt = buildPrompt({ categoryLabel: 'דירה', facts: FACTS });

    assert.match(prompt, /לתאר, לא לשבח/);
    assert.match(prompt, /אין להמציא עובדה/);
    assert.match(prompt, /אין לכתוב על השכונה/);
    assert.match(prompt, /אין לכתוב מספר שלא מופיע/);
  });

  it('includes the seller’s own words when they wrote some', () => {
    const prompt = buildPrompt({
      categoryLabel: 'דירה',
      facts: FACTS,
      sellerNotes: 'שיפצנו את המטבח לפני שנתיים',
    });

    assert.match(prompt, /שיפצנו את המטבח/);
  });

  it('has nowhere to put a photograph', () => {
    // The constraint is structural. A model handed photographs describes what
    // it thinks it sees, and what it thinks it sees in a blurry corner is a
    // fireplace that does not exist.
    const input = { categoryLabel: 'דירה', facts: FACTS };
    assert.ok(!('photos' in input));
    assert.ok(!('images' in input));
  });
});

describe('findBannedWords', () => {
  it('catches the three the brief names', () => {
    assert.deepEqual(findBannedWords('דירה חלומית'), ['חלומית']);
    assert.deepEqual(findBannedWords('נוף מדהים'), ['מדהים']);
    assert.deepEqual(findBannedWords('נכס ייחודי'), ['ייחודי']);
  });

  it('catches gender variants too', () => {
    // Banning חלומית while allowing חלומי would be theatre — a Hebrew model
    // reaches for both.
    assert.ok(findBannedWords('פרויקט חלומי').length > 0);
    assert.ok(findBannedWords('דירה מושלמת').length > 0);
  });

  it('passes plain description', () => {
    assert.deepEqual(findBannedWords('ארבעה חדרים, קומה שלישית, עם מעלית.'), []);
  });

  it('has no duplicate entries in the list itself', () => {
    assert.equal(new Set(BANNED_SUPERLATIVES).size, BANNED_SUPERLATIVES.length);
  });
});

describe('findReservedTopics', () => {
  it('flags claims the enrichment section already owns', () => {
    // An unsourced sentence sitting above a sourced block is the one a reader
    // remembers.
    assert.ok(findReservedTopics('קרוב לבתי ספר טובים').includes('בתי ספר'));
    assert.ok(findReservedTopics('תחבורה ציבורית זמינה').includes('תחבורה'));
  });

  it('flags future value, which is a valuation', () => {
    assert.ok(findReservedTopics('פוטנציאל השבחה גבוה').length > 0);
    assert.ok(findReservedTopics('השקעה מצוינת').includes('השקעה'));
  });

  it('passes a description that sticks to the property', () => {
    assert.deepEqual(findReservedTopics('ארבעה חדרים עם מרפסת דרומית.'), []);
  });
});

describe('findUnsupportedNumbers', () => {
  it('accepts numbers that came from the facts', () => {
    assert.deepEqual(findUnsupportedNumbers('4 חדרים על 95 מ״ר בקומה 3', FACTS), []);
  });

  it('flags a number no fact supports', () => {
    // The hardest fabrication to spot by reading: "שלושה חדרים" in a two-room
    // flat looks exactly like a correct sentence.
    assert.deepEqual(findUnsupportedNumbers('5 חדרים', FACTS), ['5']);
  });

  it('flags an invented distance, which is the classic case', () => {
    assert.deepEqual(findUnsupportedNumbers('7 דקות מהים', FACTS), ['7']);
  });

  it('reports each unsupported number once', () => {
    assert.deepEqual(findUnsupportedNumbers('7 ו-7 ו-8', FACTS), ['7', '8']);
  });
});

describe('reviewDescription', () => {
  it('is clean for an honest paragraph', () => {
    const review = reviewDescription('הדירה בת 4 חדרים, 95 מ״ר, בקומה 3 עם מעלית.', FACTS);

    assert.deepEqual(review.bannedWords, []);
    assert.deepEqual(review.reservedTopics, []);
    assert.deepEqual(review.unsupportedNumbers, []);
    assert.equal(review.clean, true);
  });

  it('reports every kind of problem at once', () => {
    const review = reviewDescription(
      'דירה חלומית, 6 חדרים, קרוב לבתי ספר מצוינים.',
      FACTS,
    );

    assert.deepEqual(review.bannedWords, ['חלומית']);
    assert.ok(review.reservedTopics.includes('בתי ספר'));
    assert.deepEqual(review.unsupportedNumbers, ['6']);
    assert.equal(review.clean, false);
  });
});

describe('isUnedited — the publish gate', () => {
  const generated = 'הדירה בת 4 חדרים ובה מעלית.';

  it('is true when the seller changed nothing', () => {
    // Generated text is never published unedited. Not because the model
    // writes badly — because the seller is the one making a representation
    // about their own property, and a description nobody read is a claim
    // nobody stands behind.
    assert.equal(isUnedited(generated, generated), true);
  });

  it('ignores whitespace, so a stray newline is not "editing"', () => {
    assert.equal(isUnedited(generated, `  ${generated}\n`), true);
  });

  it('is false once the seller has actually changed the words', () => {
    assert.equal(isUnedited(generated, 'הדירה בת 4 חדרים, ובה מעלית וממ״ד.'), false);
  });
});
