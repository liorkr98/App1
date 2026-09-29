import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Fact } from '../../types/listing.js';
import { templateFits } from './manifest.js';
import { suggestTemplate } from './suggest.js';

const fact = (key: string, value: Fact['value'], extra: Partial<Fact> = {}): Fact =>
  ({ key, label: key, value, present: true, source: 'seller', ...extra }) as Fact;

describe('suggestTemplate', () => {
  it('stamps a car with a sourced public record as Dossier', () => {
    const facts = [fact('year', 2016, { source: 'verified', sourceName: 'משרד התחבורה', sourceDate: '08/2026' })];
    assert.deepEqual(suggestTemplate({ category: 'vehicle', facts, namedRooms: 0 }), { id: 'dossier', reason: 'verified' });
  });

  it('never calls a car verified without a name and a date', () => {
    const facts = [fact('year', 2016, { source: 'verified' })];
    assert.equal(suggestTemplate({ category: 'vehicle', facts, namedRooms: 0 }).id, 'showroom');
  });

  it('draws a home with a balcony direction and a street in the sun', () => {
    const out = suggestTemplate({ category: 'property', facts: [fact('aspect', 'דרום')], street: 'דיזנגוף 99', namedRooms: 2 });
    assert.deepEqual(out, { id: 'heliograph', reason: 'sun' });
  });

  it('needs the street for the sun, and an answered direction', () => {
    assert.equal(suggestTemplate({ category: 'property', facts: [fact('aspect', 'דרום')], namedRooms: 0 }).id, 'aurora');
    const absent = fact('aspect', null, { present: false });
    assert.equal(suggestTemplate({ category: 'property', facts: [absent], street: 'x', namedRooms: 0 }).id, 'aurora');
  });

  it('prefers a floor plan, then five named rooms', () => {
    assert.equal(suggestTemplate({ category: 'property', facts: [], namedRooms: 0, hasFloorPlan: true }).id, 'blueprint');
    assert.equal(suggestTemplate({ category: 'property', facts: [], namedRooms: 5 }).id, 'monolith');
    assert.equal(suggestTemplate({ category: 'property', facts: [], namedRooms: 4 }).id, 'aurora');
  });

  it('always suggests a template drawn for the category', () => {
    for (const category of ['property', 'vehicle'] as const) {
      for (const namedRooms of [0, 6]) {
        const { id } = suggestTemplate({ category, facts: [fact('aspect', 'צפון')], street: 'x', namedRooms, hasFloorPlan: namedRooms > 0 });
        assert.ok(templateFits(id, category), `${id} for ${category}`);
      }
    }
  });
});
