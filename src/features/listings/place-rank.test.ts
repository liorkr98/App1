import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { BRANDS } from './brands.he.js';
import { applyPicks, brandOf, isTypedShop, rankEveryday, shopName } from './place-rank.js';

describe('brand list', () => {
  it('matches the ingest file', () => {
    const file = JSON.parse(readFileSync(new URL('../../../ingest/data/brands.he.json', import.meta.url), 'utf8'));
    assert.deepEqual(file, BRANDS);
  });
});

describe('rankEveryday', () => {
  it('prefers a chain a buyer knows over a nearer unbranded shop', () => {
    const ranked = rankEveryday([
      { name: 'מרים', walkMinutes: 1 },
      { name: 'AM:PM', walkMinutes: 4 },
    ]);
    assert.deepEqual(ranked.map((place) => place.name), ['AM:PM']);
  });

  it('drops a category that has no recognisable name', () => {
    assert.deepEqual(rankEveryday([{ name: 'מרים', walkMinutes: 1 }]), []);
  });

  it('keeps one branch of a chain and three of a category', () => {
    const ranked = rankEveryday([
      { name: 'AM:PM דיזנגוף', walkMinutes: 2 },
      { name: 'AM:PM אלנבי', walkMinutes: 5 },
      { name: 'שופרסל', walkMinutes: 3 },
      { name: 'רמי לוי', walkMinutes: 6 },
      { name: 'ויקטורי', walkMinutes: 7 },
      { name: 'אושר עד', walkMinutes: 8 },
    ]);
    const names = ranked.map((place) => place.name);
    assert.equal(names.filter((name) => name.startsWith('AM:PM')).length, 1);
    assert.equal(names.length, 3);
    assert.equal(brandOf('מרים'), undefined);
    assert.equal(brandOf('AM:PM דיזנגוף')?.brand, 'AM:PM');
  });
});

describe('shop filters', () => {
  it('requires name:he and skips Latin-only names', () => {
    assert.deepEqual(shopName({ name: 'Miriam' }), { skip: 'missing' });
    assert.deepEqual(shopName({ 'name:he': 'Miriam' }), { skip: 'latin' });
    assert.deepEqual(shopName({ 'name:he': 'AM:PM' }), { name: 'AM:PM' });
  });

  it('skips shop=yes', () => {
    assert.equal(isTypedShop({ shop: 'yes', 'name:he': 'מרים' }), false);
    assert.equal(isTypedShop({ shop: 'convenience', 'name:he': 'AM:PM' }), true);
    assert.equal(isTypedShop({ amenity: 'pharmacy' }), true);
  });
});

describe('applyPicks', () => {
  it('lets the agent choose, up to eight, in their order', () => {
    const places = [
      { name: 'AM:PM', walkMinutes: 4 },
      { name: 'מרים', walkMinutes: 1 },
      { name: 'שופרסל', walkMinutes: 6 },
    ];
    assert.deepEqual(
      applyPicks(places, ['מרים', 'שופרסל']).map((place) => place.name),
      ['מרים', 'שופרסל'],
    );
    assert.equal(applyPicks(places, undefined).length, 3);
  });
});
