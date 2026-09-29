import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PropertyEnrichment } from '../../types/listing.js';
import { walkStops } from './walk-stops.js';

const SRC = { sourceName: 'OpenStreetMap', sourceDate: '2026-09-05' };
const enrichment = (overrides: Partial<PropertyEnrichment> = {}): PropertyEnrichment => ({
  category: 'property',
  transit: [
    { id: 't1', name: 'דיזנגוף/פרישמן', mode: 'bus', routes: ['5', '72'], walkMinutes: 2, ...SRC },
    { id: 't2', name: 'דיזנגוף סנטר', mode: 'light_rail', routes: ['אדום'], walkMinutes: 6, ...SRC },
  ],
  schools: [{ id: 's1', name: 'ארנון', type: 'יסודי', stream: 'ממלכתי', walkMinutes: 7, ...SRC }],
  places: [
    { id: 'p1', name: 'קפה לנדוור', category: 'cafe', walkMinutes: 3, ...SRC },
    { id: 'p2', name: 'גן מאיר', category: 'park', walkMinutes: 8, ...SRC },
    { id: 'p3', name: 'דיזנגוף סנטר', category: 'culture', walkMinutes: 9, ...SRC },
  ],
  summary: {},
  attributions: ['© OpenStreetMap contributors, ODbL'],
  ...overrides,
});

describe('walk stops', () => {
  it('orders every kind of stop by walking minutes from the door', () => {
    const stops = walkStops(enrichment());
    assert.deepEqual(
      stops.map((s) => s.minutes),
      [2, 3, 6, 7, 8],
    );
    assert.deepEqual(
      stops.map((s) => s.kind),
      ['transit', 'place', 'transit', 'school', 'place'],
    );
  });

  it('keeps a name that appears twice once, at its nearest', () => {
    const names = walkStops(enrichment()).map((s) => s.name);
    assert.equal(names.filter((n) => n === 'דיזנגוף סנטר').length, 1);
  });

  it('caps the route', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `x${i}`,
      name: `מקום ${i}`,
      category: 'cafe' as const,
      walkMinutes: i,
      ...SRC,
    }));
    assert.equal(walkStops(enrichment({ places: many }), 10).length, 10);
  });

  it('drops a stop with no name or no usable time rather than inventing one', () => {
    const stops = walkStops(
      enrichment({
        transit: [],
        schools: [],
        places: [
          { id: 'a', name: ' ', category: 'cafe', walkMinutes: 1, ...SRC },
          { id: 'b', name: 'בלי זמן', category: 'cafe', walkMinutes: Number.NaN, ...SRC },
        ],
      }),
    );
    assert.equal(stops.length, 0);
  });
});
