import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { listingBrowserPath } from './derived-photo.js';

const ORIGIN = 'https://yaaqcfcjkfdwtczespny.supabase.co';
const LISTING = '11111111-1111-1111-1111-111111111111';
const OK = `${ORIGIN}/storage/v1/object/public/derived/${LISTING}/browser/cover.webp`;

describe('listingBrowserPath', () => {
  it('keeps a public file in this listing and refuses the rest', () => {
    assert.equal(listingBrowserPath(OK, ORIGIN, LISTING), `${LISTING}/browser/cover.webp`);
    assert.equal(listingBrowserPath(OK, ORIGIN, '22222222-2222-2222-2222-222222222222'), undefined);
    assert.equal(
      listingBrowserPath(`${ORIGIN}/storage/v1/object/public/derived/${LISTING}/depth/cover.webp`, ORIGIN, LISTING),
      undefined,
    );
    assert.equal(listingBrowserPath('https://example.com/cover.webp', ORIGIN, LISTING), undefined);
    assert.equal(listingBrowserPath(OK.replace('https:', 'http:'), ORIGIN, LISTING), undefined);
  });
});
