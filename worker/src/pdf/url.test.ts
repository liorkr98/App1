import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { listingPdfUrl, SLUG_PATTERN } from './url.js';

const PAGE = 'https://hasivuv.com';
const SLUG = 'A7K2M';

describe('SLUG_PATTERN', () => {
  it('accepts five Crockford characters', () => {
    assert.equal(SLUG_PATTERN.test('A7K2M'), true);
    assert.equal(SLUG_PATTERN.test('0123Z'), true);
  });

  it('rejects the letters Crockford dropped, and anything else', () => {
    assert.equal(SLUG_PATTERN.test('A7K2I'), false);
    assert.equal(SLUG_PATTERN.test('A7K2L'), false);
    assert.equal(SLUG_PATTERN.test('A7K2O'), false);
    assert.equal(SLUG_PATTERN.test('A7K2U'), false);
    assert.equal(SLUG_PATTERN.test('a7k2m'), false);
    assert.equal(SLUG_PATTERN.test('../A7'), false);
    assert.equal(SLUG_PATTERN.test('A7K2M/x'), false);
    assert.equal(SLUG_PATTERN.test('A7K2'), false);
    assert.equal(SLUG_PATTERN.test('A7K2M3'), false);
  });
});

describe('listingPdfUrl', () => {
  it('builds /a/{slug}/ on PAGE_BASE_URL when no override is sent', () => {
    assert.equal(listingPdfUrl({ slug: SLUG, pageBaseUrl: PAGE }), 'https://hasivuv.com/a/A7K2M/');
  });

  it('strips a trailing slash on PAGE_BASE_URL rather than doubling the path', () => {
    assert.equal(
      listingPdfUrl({ slug: SLUG, pageBaseUrl: 'https://hasivuv.com/' }),
      'https://hasivuv.com/a/A7K2M/',
    );
  });

  it('ignores a same-origin baseUrl path — the payload does not choose the path', () => {
    assert.equal(
      listingPdfUrl({
        slug: SLUG,
        pageBaseUrl: PAGE,
        baseUrl: 'https://hasivuv.com/redirect',
      }),
      'https://hasivuv.com/a/A7K2M/',
    );
  });

  it('refuses a baseUrl on another origin', () => {
    assert.equal(
      listingPdfUrl({
        slug: SLUG,
        pageBaseUrl: PAGE,
        baseUrl: 'https://evil.example',
      }),
      undefined,
    );
  });

  it('refuses a lookalike host and a userinfo rewrite', () => {
    assert.equal(
      listingPdfUrl({
        slug: SLUG,
        pageBaseUrl: PAGE,
        baseUrl: 'https://hasivuv.com.evil.example',
      }),
      undefined,
    );
    assert.equal(
      listingPdfUrl({
        slug: SLUG,
        pageBaseUrl: PAGE,
        baseUrl: 'https://hasivuv.com@evil.example',
      }),
      undefined,
    );
  });

  it('refuses a scheme that is not the page origin', () => {
    assert.equal(
      listingPdfUrl({ slug: SLUG, pageBaseUrl: PAGE, baseUrl: 'javascript:alert(1)' }),
      undefined,
    );
    assert.equal(
      listingPdfUrl({ slug: SLUG, pageBaseUrl: PAGE, baseUrl: 'file:///etc/passwd' }),
      undefined,
    );
  });

  it('refuses a slug the listings CHECK would also refuse', () => {
    assert.equal(listingPdfUrl({ slug: '../etc', pageBaseUrl: PAGE }), undefined);
    assert.equal(listingPdfUrl({ slug: 'not-a-slug', pageBaseUrl: PAGE }), undefined);
    assert.equal(listingPdfUrl({ slug: 12, pageBaseUrl: PAGE }), undefined);
  });
});
