import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapCardSrc, wazeNavigateUrl } from './map-card.js';

describe('mapCardSrc', () => {
  it('is an inline SVG, not a third-party tile', () => {
    const src = mapCardSrc();
    assert.match(src, /^data:image\/svg\+xml;charset=utf-8,/);
    assert.equal(src.startsWith('https://'), false);
  });
});

describe('wazeNavigateUrl', () => {
  it('builds a Waze link from a finite coordinate and drops a bad one', () => {
    assert.equal(
      wazeNavigateUrl(32.0165, 34.7792),
      'https://waze.com/ul?ll=32.0165,34.7792&navigate=yes',
    );
    assert.equal(wazeNavigateUrl(Number.NaN, 34.7), undefined);
  });
});
