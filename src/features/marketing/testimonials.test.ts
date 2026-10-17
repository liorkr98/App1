import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { consentRecorded, shownTestimonials, TESTIMONIALS, type Testimonial } from './testimonials.js';

const entry = (overrides: Partial<Testimonial> = {}, consent: Partial<Testimonial['consent']> = {}): Testimonial => ({
  quote: 'ציטוט לבדיקה',
  name: 'שם לבדיקה',
  role: 'תפקיד לבדיקה',
  ...overrides,
  consent: { date: '2026-10-01', how: 'בדיקה', ...consent },
});

describe('testimonials', () => {
  it('every testimonial in the file has its consent on record', () => {
    for (const item of TESTIMONIALS) {
      assert.ok(consentRecorded(item), `no recorded consent for "${item.name}"`);
    }
  });

  it('refuses an entry without a consent date, a way, or a quote', () => {
    const today = new Date('2026-10-17T12:00:00Z');
    assert.equal(consentRecorded(entry({}, { date: '' }), today), false);
    assert.equal(consentRecorded(entry({}, { how: ' ' }), today), false);
    assert.equal(consentRecorded(entry({ quote: '' }), today), false);
    assert.equal(consentRecorded(entry({}, { date: '2026-02-30' }), today), false);
    assert.equal(consentRecorded(entry({}, { date: '2026-11-01' }), today), false, 'consent from the future');
    assert.equal(consentRecorded(entry(), today), true);
  });

  it('shows only the entries with consent', () => {
    assert.deepEqual(
      shownTestimonials([entry({ name: 'א' }), entry({ name: 'ב' }, { date: 'soon' })]).map((item) => item.name),
      ['א'],
    );
  });
});
