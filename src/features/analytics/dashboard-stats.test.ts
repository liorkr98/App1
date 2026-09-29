import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  contactRate,
  daysSincePublished,
  israelDay,
  lastDays,
  readRate,
  readThrough,
  series,
  totals,
  type DailyRow,
  type ReadRow,
} from './dashboard-stats.js';

const TODAY = new Date('2026-09-24T09:00:00Z');

describe('israelDay', () => {
  it('uses the Israel calendar, not UTC', () => {
    // 22:30 UTC on the 23rd is 01:30 on the 24th in Tel Aviv (UTC+3).
    assert.equal(israelDay(new Date('2026-09-23T22:30:00Z')), '2026-09-24');
  });
});

describe('lastDays', () => {
  it('ends today and runs oldest first', () => {
    const days = lastDays(TODAY, 3);
    assert.deepEqual(days, ['2026-09-22', '2026-09-23', '2026-09-24']);
  });

  it('returns thirty distinct days for a thirty-day window', () => {
    assert.equal(new Set(lastDays(TODAY, 30)).size, 30);
  });
});

describe('series', () => {
  const rows: DailyRow[] = [
    { listing_id: 'a', day: '2026-09-23', views: 12, wa_taps: 1 },
    { listing_id: 'b', day: '2026-09-23', views: 5, wa_taps: 0 },
    { listing_id: 'a', day: '2026-09-24', views: 7, wa_taps: 2 },
    // Outside the window: never counted.
    { listing_id: 'a', day: '2026-08-01', views: 999, wa_taps: 99 },
  ];
  const days = lastDays(TODAY, 3);

  it('zero-fills days with no rows rather than skipping them', () => {
    const points = series(rows, days, 'a');
    assert.deepEqual(points, [
      { day: '2026-09-22', views: 0, taps: 0 },
      { day: '2026-09-23', views: 12, taps: 1 },
      { day: '2026-09-24', views: 7, taps: 2 },
    ]);
  });

  it('sums every listing when no id is given', () => {
    assert.deepEqual(totals(series(rows, days)), { views: 24, taps: 3 });
  });

  it('coerces the bigint strings PostgREST can return', () => {
    const loose = [{ listing_id: 'a', day: '2026-09-24', views: '4', wa_taps: '1' }] as unknown as DailyRow[];
    assert.deepEqual(totals(series(loose, days)), { views: 4, taps: 1 });
  });
});

describe('contactRate', () => {
  it('is taps over views, one decimal', () => {
    assert.equal(contactRate(612, 19), 3.1);
  });

  it('is absent, not zero, when nobody has viewed', () => {
    assert.equal(contactRate(0, 0), undefined);
  });
});

describe('daysSincePublished', () => {
  it('covers the publishing day through today', () => {
    assert.deepEqual(daysSincePublished('2026-09-22T08:00:00Z', TODAY), [
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
    ]);
  });

  it('caps a long-lived listing at the window', () => {
    assert.equal(daysSincePublished('2025-01-01T00:00:00Z', TODAY, 30).length, 30);
  });

  it('is empty for an unreadable date', () => {
    assert.deepEqual(daysSincePublished('not a date', TODAY), []);
  });
});

describe('readThrough', () => {
  const rows: ReadRow[] = [
    { listing_id: 'a', day: '2026-09-23', views: 10, read_to_agent: 6 },
    { listing_id: 'b', day: '2026-09-23', views: 4, read_to_agent: 1 },
    { listing_id: 'a', day: '2026-09-24', views: 5, read_to_agent: 2 },
    { listing_id: 'a', day: '2026-08-01', views: 500, read_to_agent: 400 },
  ];
  const days = lastDays(TODAY, 3);

  it('sums one listing inside the window only', () => {
    assert.deepEqual(readThrough(rows, days, 'a'), { views: 15, reads: 8 });
  });

  it('sums every listing without an id', () => {
    assert.deepEqual(readThrough(rows, days), { views: 19, reads: 9 });
  });
});

describe('readRate', () => {
  it('is absent with no views, not 0%', () => {
    assert.equal(readRate(0, 0), undefined);
  });

  it('rounds to a whole percent', () => {
    assert.equal(readRate(15, 8), 53);
  });

  it('never claims more than every reader', () => {
    assert.equal(readRate(3, 5), 100);
  });
});
