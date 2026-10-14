import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { PRICE_DROP_DAYS, priceDrop } from './price-drop.js';

const at = new Date('2026-10-14T12:00:00Z');
const base = {
  price: 1_900_000,
  priceWas: 2_100_000,
  priceDroppedAt: '2026-10-10T09:00:00Z',
  status: 'published' as const,
};

describe('priceDrop (0043)', () => {
  it('shows a recent drop on a live listing', () => {
    assert.deepEqual(priceDrop(base, at), { was: 2_100_000, now: 1_900_000 });
  });

  it('stops after the window', () => {
    const old = new Date(at.getTime() - (PRICE_DROP_DAYS + 1) * 86_400_000).toISOString();
    assert.equal(priceDrop({ ...base, priceDroppedAt: old }, at), undefined);
    const edge = new Date(at.getTime() - PRICE_DROP_DAYS * 86_400_000 + 1000).toISOString();
    assert.ok(priceDrop({ ...base, priceDroppedAt: edge }, at));
  });

  it('never shows on a listing that is not live, or without a real drop', () => {
    assert.equal(priceDrop({ ...base, status: 'sold' }, at), undefined);
    assert.equal(priceDrop({ ...base, status: 'draft' }, at), undefined);
    const { priceWas: _unused, ...noDrop } = base;
    assert.equal(priceDrop(noDrop, at), undefined);
    assert.equal(priceDrop({ ...base, priceWas: 1_900_000 }, at), undefined);
    assert.equal(priceDrop({ ...base, price: 0 }, at), undefined);
    assert.equal(priceDrop({ ...base, priceDisplay: 'on_request' }, at), undefined);
    assert.equal(priceDrop({ ...base, priceDroppedAt: 'not a date' }, at), undefined);
  });

  it('uses the same window as the migration', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/0043_price_drop.sql', import.meta.url), 'utf8');
    assert.match(sql, new RegExp(`interval '${PRICE_DROP_DAYS} days'`));
  });
});
