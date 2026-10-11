import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import { checkWebp, hashPortalToken, isDimension, isPortalToken, phoneUploadPath } from './phone-portal.js';

/** A RIFF/WEBP container from chunks, sizes and padding written as the spec says. */
function webp(chunks: [string, number][]): Uint8Array {
  const body: number[] = [];
  for (const [id, size] of chunks) {
    body.push(...[...id].map((c) => c.charCodeAt(0)));
    body.push(size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >>> 24) & 0xff);
    body.push(...new Array(size + (size % 2)).fill(0));
  }
  const total = 4 + body.length;
  return new Uint8Array([
    ...[...'RIFF'].map((c) => c.charCodeAt(0)),
    total & 0xff, (total >> 8) & 0xff, (total >> 16) & 0xff, (total >>> 24) & 0xff,
    ...[...'WEBP'].map((c) => c.charCodeAt(0)),
    ...body,
  ]);
}

describe('portal token', () => {
  it('accepts exactly 64 lowercase hex characters', () => {
    assert.equal(isPortalToken('a'.repeat(64)), true);
    assert.equal(isPortalToken('A'.repeat(64)), false);
    assert.equal(isPortalToken('a'.repeat(63)), false);
    assert.equal(isPortalToken(undefined), false);
  });

  it('hashes the way Postgres does: sha256 of the UTF-8 text, as hex', async () => {
    const token = '0123456789abcdef'.repeat(4);
    assert.equal(await hashPortalToken(token), createHash('sha256').update(token, 'utf8').digest('hex'));
  });
});

describe('checkWebp', () => {
  it('lets in what a canvas makes: VP8 data, nothing else', () => {
    assert.deepEqual(checkWebp(webp([['VP8 ', 31]])), { ok: true });
    assert.deepEqual(checkWebp(webp([['VP8X', 10], ['VP8 ', 40]])), { ok: true });
  });

  it('refuses a photograph that still carries EXIF or XMP (the GPS)', () => {
    assert.deepEqual(checkWebp(webp([['VP8X', 10], ['VP8 ', 40], ['EXIF', 120]])), { ok: false, reason: 'metadata' });
    assert.deepEqual(checkWebp(webp([['VP8X', 10], ['XMP ', 33], ['VP8 ', 40]])), { ok: false, reason: 'metadata' });
  });

  it('refuses what is not a WebP, or is cut short', () => {
    assert.deepEqual(checkWebp(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, ...new Array(30).fill(0)])), {
      ok: false,
      reason: 'not_webp',
    });
    const whole = webp([['VP8 ', 40]]);
    assert.deepEqual(checkWebp(whole.slice(0, whole.length - 5)), { ok: false, reason: 'malformed' });
  });
});

describe('phoneUploadPath', () => {
  it('stays under the listing\'s browser/ prefix whatever the random part holds', () => {
    assert.equal(phoneUploadPath('L1', 5, 'ab/../c d'), 'L1/browser/phone-5-abcd.webp');
    assert.equal(phoneUploadPath('L1', 5, '///'), 'L1/browser/phone-5-x.webp');
  });
});

describe('isDimension', () => {
  it('matches the inbox check constraint', () => {
    assert.equal(isDimension(1600), true);
    assert.equal(isDimension(0), false);
    assert.equal(isDimension(4001), false);
    assert.equal(isDimension(12.5), false);
  });
});
