import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseEnrichmentBlock } from './enrichment-payload.js';

describe('parseEnrichmentBlock', () => {
  it('keeps routed transit and drops a valuation neighbourhood note', () => {
    const parsed = parseEnrichmentBlock({
      category: 'property',
      transit: [
        {
          id: 't1',
          name: 'וולפסון',
          mode: 'light_rail',
          routes: ['הקו הסגול'],
          walkMinutes: 7,
          sourceName: 'משרד התחבורה',
          sourceDate: '2026-09-01',
        },
      ],
      schools: [],
      places: [],
      civic: [
        {
          id: 'c1',
          name: 'תחנת חולון',
          kind: 'police',
          walkMinutes: 12,
          sourceName: 'משטרת ישראל',
          sourceDate: '2026-09-15',
        },
      ],
      summary: {},
      attributions: [],
      neighborhoodNote: { text: 'השקעה מצוינת ליד הרכבת.' },
    });
    assert.ok(parsed && parsed.category === 'property');
    assert.equal(parsed.transit[0]?.walkMinutes, 7);
    assert.equal(parsed.civic?.[0]?.kind, 'police');
    assert.equal(parsed.neighborhoodNote, undefined);
  });

  it('omits a payload that is not an enrichment block', () => {
    assert.equal(parseEnrichmentBlock({ hello: true }), undefined);
    assert.equal(parseEnrichmentBlock(null), undefined);
  });
});
