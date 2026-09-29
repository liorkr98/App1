import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { publicDerivedUrl } from './allow.js';

const SUPABASE = 'https://abc.supabase.co';

describe('publicDerivedUrl', () => {
  it('allows a public object in our derived bucket', () => {
    const url = `${SUPABASE}/storage/v1/object/public/derived/l1/browser/x.webp`;
    assert.equal(publicDerivedUrl(url, SUPABASE), url);
  });

  it('refuses anything a listing owner could point elsewhere', () => {
    for (const bad of [
      'http://abc.supabase.co/storage/v1/object/public/derived/x.webp',
      'https://evil.example/storage/v1/object/public/derived/x.webp',
      `${SUPABASE}/storage/v1/object/public/originals/x.jpg`,
      `${SUPABASE}/storage/v1/object/sign/derived/x.webp`,
      `https://user:pw@abc.supabase.co/storage/v1/object/public/derived/x.webp`,
      'http://169.254.169.254/latest/meta-data/',
      'file:///etc/passwd',
      42,
    ]) {
      assert.equal(publicDerivedUrl(bad, SUPABASE), undefined, String(bad));
    }
  });
});
