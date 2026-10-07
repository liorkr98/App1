import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PropertyEnrichment } from '../../types/listing.js';
import { areaWalkStops, walkStops } from './walk-stops.js';

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

describe('areaWalkStops — the route from the stored neighbourhood', () => {
  const places = {
    city: 'תל אביב',
    street: 'הקישון',
    origin: { lat: 32.0566, lon: 34.7701 },
    neighbourhoods: [{ name: 'פלורנטין', lat: 32.05, lon: 34.76 }],
    schools: [{ name: 'בית ספר בלפור', lat: 32.05, lon: 34.77, walkMinutes: 4 }],
    transit: [
      { name: 'הקישון/אברבנאל', lat: 32.05, lon: 34.76, walkMinutes: 1, mode: 'bus' as const },
      { name: 'תחנת אליפלט', lat: 32.05, lon: 34.76, walkMinutes: 7, mode: 'rail' as const },
    ],
    parks: [{ name: 'גינת לוינסקי', lat: 32.05, lon: 34.77 }],
    community: [],
    shops: [{ name: 'שוק לוינסקי', lat: 32.05, lon: 34.77, walkMinutes: 4 }],
  };

  it('orders stops by routed minutes and labels them by group', () => {
    const stops = areaWalkStops(places);
    assert.deepEqual(
      stops.map((stop) => [stop.name, stop.minutes, stop.kind === 'area' ? stop.group : '']),
      [
        ['הקישון/אברבנאל', 1, 'bus'],
        ['בית ספר בלפור', 4, 'school'],
        ['שוק לוינסקי', 4, 'shop'],
        ['תחנת אליפלט', 7, 'rail'],
      ],
    );
  });

  it('drops a place with no routed minutes — never a guessed time (CLAUDE.md §2)', () => {
    assert.ok(!areaWalkStops(places).some((stop) => stop.name === 'גינת לוינסקי'));
  });

  it('never lists a neighbourhood name as a stop', () => {
    assert.ok(!areaWalkStops(places).some((stop) => stop.name === 'פלורנטין'));
  });
});
