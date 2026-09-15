import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stationToStop, withinIsrael, type StationRow } from './stations.js';

const sample = (over: Partial<StationRow> = {}): StationRow => ({
  _id: 1,
  StationId: 2228,
  CityName: 'אבו גוש',
  StationTypeName: 'תחנה רגילה',
  Lat: 31.806622,
  Long: 35.114168,
  ...over,
});

describe('stationToStop', () => {
  it('maps a live CKAN row onto transit_stops without inventing a street', () => {
    const stop = stationToStop(sample());
    assert.ok(stop);
    assert.equal(stop.stop_id, 'gov-2228');
    assert.equal(stop.mode, 'bus');
    assert.deepEqual(stop.routes, []);
    assert.equal(stop.name, 'תחנה רגילה, אבו גוש');
    assert.match(stop.geom, /^SRID=4326;POINT\(35\.114168 31\.806622\)$/);
  });

  it('prefixes gov- so a later GTFS upsert cannot collide', () => {
    const stop = stationToStop(sample({ StationId: '404' }));
    assert.equal(stop?.stop_id, 'gov-404');
  });

  it('drops a row with no coordinate or an out-of-country point', () => {
    assert.equal(stationToStop(sample({ Lat: 'x', Long: 'y' })), undefined);
    assert.equal(stationToStop(sample({ Lat: 48.8, Long: 2.3 })), undefined);
    assert.equal(stationToStop(sample({ StationId: '' })), undefined);
  });
});

describe('withinIsrael', () => {
  it('accepts the measured Abu Ghosh station and rejects Paris', () => {
    assert.equal(withinIsrael(35.114168, 31.806622), true);
    assert.equal(withinIsrael(2.3, 48.8), false);
  });
});
