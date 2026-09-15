import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { policeToSite, withinIsrael, type PoliceRow } from './police.js';

const sample = (over: Partial<PoliceRow> = {}): PoliceRow => ({
  _id: 1,
  UnitName: 'אגף התנועה',
  SiteType: 'מטה',
  Address: 'כביש 412 בסמוך לצומת בית דגן, בית דגן',
  Long_X_: 34.822599,
  Lat_Y: 32.000961,
  ...over,
});

describe('policeToSite', () => {
  it('maps the measured Beit Dagan gold vector onto civic_sites', () => {
    const site = policeToSite(sample());
    assert.ok(site);
    assert.equal(site.site_id, 'police-1');
    assert.equal(site.kind, 'police');
    assert.equal(site.name, 'אגף התנועה');
    assert.match(site.geom, /^SRID=4326;POINT\(34\.822599 32\.000961\)$/);
  });

  it('drops a row with no name or an out-of-country point', () => {
    assert.equal(policeToSite(sample({ UnitName: '' })), undefined);
    assert.equal(policeToSite(sample({ Long_X_: 2.3, Lat_Y: 48.8 })), undefined);
  });
});

describe('withinIsrael', () => {
  it('accepts the gold vector and rejects Paris', () => {
    assert.equal(withinIsrael(34.822599, 32.000961), true);
    assert.equal(withinIsrael(2.3, 48.8), false);
  });
});
