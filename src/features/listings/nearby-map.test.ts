import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapNearbyItems } from './nearby-map.js';
import type { PropertyEnrichment } from '../../types/listing.js';

const provenance = { sourceName: 'משרד התחבורה', sourceDate: '2026-09-01' };

const enrichment = (over: Partial<PropertyEnrichment> = {}): PropertyEnrichment => ({
  category: 'property',
  transit: [
    { id: 'b', name: 'אוטובוס קרוב', mode: 'bus', routes: ['5'], walkMinutes: 3, ...provenance },
    { id: 'r', name: 'רכבת קלה', mode: 'light_rail', routes: ['הקו הסגול'], walkMinutes: 7, ...provenance },
  ],
  schools: [
    { id: 's2', name: 'תיכון', type: 'תיכון', stream: 'ממלכתי', walkMinutes: 16, ...provenance },
    { id: 's1', name: 'יסודי', type: 'יסודי', stream: 'ממלכתי', walkMinutes: 6, ...provenance },
  ],
  places: [
    { id: 'p1', name: 'שופרסל', category: 'grocery', walkMinutes: 5, sourceName: 'OpenStreetMap', sourceDate: '2026-09-05' },
    { id: 'p2', name: 'פארק', category: 'park', walkMinutes: 2, sourceName: 'OpenStreetMap', sourceDate: '2026-09-05' },
  ],
  summary: { nearestGrocery: { name: 'שופרסל', walkMinutes: 5 } },
  attributions: ['© מפתחי OpenStreetMap, ברישיון ODbL'],
  ...over,
});

describe('mapNearbyItems', () => {
  it('picks rail-first transit, the nearest school, and the grocery', () => {
    const items = mapNearbyItems(enrichment());
    assert.deepEqual(
      items.map((item) => [item.kind, item.name, item.walkMinutes]),
      [
        ['transit', 'רכבת קלה', 7],
        ['school', 'יסודי', 6],
        ['grocery', 'שופרסל', 5],
      ],
    );
  });

  it('omits a group that has nothing rather than inventing a row', () => {
    const items = mapNearbyItems(
      enrichment({
        transit: [],
        schools: [],
        places: [],
        summary: {},
      }),
    );
    assert.deepEqual(items, []);
  });
});
