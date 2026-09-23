import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Fact } from '../../types/listing.js';
import {
  acceptDescription,
  descriptionPrompt,
  factFragments,
  groundedDescription,
  type ListingCopyInput,
} from './listing-copy.js';

const fact = (
  key: string,
  label: string,
  value: Fact['value'],
  extra: Partial<Fact> = {},
): Fact => ({
  key,
  label,
  value,
  type: 'text',
  present: true,
  required: false,
  source: 'seller',
  ...extra,
});

const PROPERTY: ListingCopyInput = {
  category: 'property',
  city: 'תל אביב',
  facts: [
    fact('rooms', 'חדרים', 4, { type: 'number' }),
    fact('area_sqm', 'מ״ר', 95, { type: 'number' }),
    fact('floor', 'קומה', 3, { type: 'number' }),
    fact('elevator', 'מעלית', true, { type: 'boolean' }),
    fact('parking', 'חניה', true, { type: 'boolean' }),
    fact('shelter', 'ממ״ד', true, { type: 'boolean' }),
    fact('condition', 'מצב הנכס', 'משופץ', { type: 'enum' }),
  ],
};

describe('factFragments', () => {
  it('reads each fact in Hebrew word order, not label-then-value', () => {
    const { measured } = factFragments(PROPERTY);

    // The whole reason `phrase` is on the schema: "4 חדרים" and "קומה 3" put
    // the number on opposite sides and no rule over the label produces both.
    assert.ok(measured.includes('4 חדרים'));
    assert.ok(measured.includes('קומה 3'));
    assert.ok(measured.includes('95 מ״ר'));
  });

  it('separates yes/no features from measurements', () => {
    const { features } = factFragments(PROPERTY);
    assert.deepEqual(features, ['מעלית', 'חניה', 'ממ״ד']);
  });

  it('omits an unanswered fact and a confirmed absence alike', () => {
    const { measured, features } = factFragments({
      ...PROPERTY,
      facts: [
        fact('rooms', 'חדרים', null, { type: 'number' }),
        fact('elevator', 'מעלית', null, { type: 'boolean', present: false }),
      ],
    });

    assert.deepEqual(measured, []);
    // present: false is "the seller said there is none". The grid shows אין;
    // the prose says nothing, because a listing does not advertise a lack.
    assert.deepEqual(features, []);
  });

  it('skips a fact the schema gave no phrasing', () => {
    const { measured } = factFragments({
      ...PROPERTY,
      facts: [fact('total_floors', 'מתוך קומות', 5, { type: 'number' })],
    });

    assert.deepEqual(measured, []);
  });

  it('groups thousands but leaves a year alone', () => {
    const { measured } = factFragments({
      category: 'vehicle',
      facts: [
        fact('mileage', 'קילומטראז׳', 80000, { type: 'number' }),
        fact('year', 'שנתון', 2021, { type: 'number' }),
      ],
    });

    assert.ok(measured.includes('80,000 ק״מ'));
    // 2021 grouped reads "2,021", which is visibly wrong to anyone who owns
    // a car. The schema records that with grouped: false.
    assert.ok(measured.includes('שנתון 2021'));
  });
});

describe('groundedDescription', () => {
  it('writes a paragraph a seller could send as it is', () => {
    assert.equal(
      groundedDescription(PROPERTY),
      'דירה בתל אביב, 4 חדרים, 95 מ״ר, קומה 3, הנכס משופץ. יש מעלית, חניה וממ״ד.',
    );
  });

  it('carries the seller\u2019s own words through unchanged', () => {
    const text = groundedDescription({ ...PROPERTY, sellerNotes: 'הדירה פונה לגינה' });
    assert.ok(text.includes('הדירה פונה לגינה.'));
  });

  it('does not repeat the surroundings inside the description', () => {
    const text = groundedDescription({
      ...PROPERTY,
      areaNote: 'הרכבת הקלה אחוזה כ־7 דקות הליכה.',
    });
    assert.equal(text.includes('הרכבת'), false);
    assert.equal(text.includes('דקות הליכה'), false);
  });

  it('generates nothing when the property has nothing to say', () => {
    assert.equal(groundedDescription({ category: 'property', facts: [] }), '');
  });

  it('agrees the room count', () => {
    const one = factFragments({
      category: 'property',
      facts: [fact('rooms', 'חדרים', 1, { type: 'number' })],
    });
    const two = factFragments({
      category: 'property',
      facts: [fact('rooms', 'חדרים', 2, { type: 'number' })],
    });
    assert.deepEqual(one.measured, ['חדר אחד']);
    assert.deepEqual(two.measured, ['שני חדרים']);
  });

  it('never invents a location for a vehicle', () => {
    const text = groundedDescription({
      category: 'vehicle',
      facts: [fact('year', 'שנתון', 2021, { type: 'number' })],
    });
    assert.equal(text, 'רכב, שנתון 2021.');
  });
});

describe('acceptDescription', () => {
  it('accepts a grounded paragraph and tidies the quoting', () => {
    const accepted = acceptDescription(
      '  "דירה בתל אביב עם 4 חדרים על 95 מ״ר, בקומה 3. יש מעלית, חניה וממ״ד."  ',
      PROPERTY,
    );
    assert.ok(accepted?.startsWith('דירה בתל אביב'));
    assert.ok(!accepted?.includes('"'));
  });

  it('rejects a number no fact supports', () => {
    // The fabrication that is hardest to catch by reading: a correct-looking
    // sentence about a flat that has three rooms, not five.
    assert.equal(
      acceptDescription('דירה בתל אביב עם 5 חדרים על 95 מ״ר, בקומה 3, משופצת.', PROPERTY),
      undefined,
    );
  });

  it('rejects a description that repeats walking times from the map', () => {
    assert.equal(
      acceptDescription(
        'דירה בתל אביב, 4 חדרים על 95 מ״ר בקומה 3. הרכבת הקלה במרחק 7 דקות הליכה.',
        { ...PROPERTY, areaNote: 'הרכבת הקלה אחוזה כ־7 דקות הליכה.' },
      ),
      undefined,
    );
  });

  it('rejects a superlative, a valuation and a model that names itself', () => {
    const base = 'דירה בתל אביב עם 4 חדרים על 95 מ״ר בקומה 3';
    assert.equal(acceptDescription(`${base}, דירה מדהימה באמת.`, PROPERTY), undefined);
    assert.equal(acceptDescription(`${base}, השקעה שתשתלם.`, PROPERTY), undefined);
    assert.equal(acceptDescription(`${base}. נכתב על ידי DeepSeek.`, PROPERTY), undefined);
  });

  it('rejects a reply that is not in Hebrew, and one that is a fragment', () => {
    assert.equal(
      acceptDescription('A bright four room apartment in central Tel Aviv, 95 sqm.', PROPERTY),
      undefined,
    );
    assert.equal(acceptDescription('דירה נחמדה.', PROPERTY), undefined);
  });
});

describe('descriptionPrompt', () => {
  it('states the city and the facts, and never the surroundings', () => {
    const prompt = descriptionPrompt({
      ...PROPERTY,
      areaNote: 'הרכבת הקלה אחוזה כ־7 דקות הליכה.',
    });

    assert.ok(prompt.includes('עיר: תל אביב'));
    assert.ok(prompt.includes('חדרים: 4'));
    assert.equal(prompt.includes('הרכבת הקלה אחוזה'), false);
    assert.equal(prompt.includes('דקות הליכה'), false);
    assert.ok(!/\d+\.\d{4,}/.test(prompt));
  });
});
