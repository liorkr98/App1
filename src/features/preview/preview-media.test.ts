import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { allowedPreviewUrl } from './preview-media.js';

const ORIGIN = 'https://hasivuv.com';
const STORAGE = 'https://abc.supabase.co';

describe('allowedPreviewUrl', () => {
  it('keeps our own paths and the public bucket', () => {
    assert.equal(allowedPreviewUrl('/fixtures/tlv-living-800.webp', ORIGIN, STORAGE), '/fixtures/tlv-living-800.webp');
    const bucket = `${STORAGE}/storage/v1/object/public/derived/x/1.webp`;
    assert.equal(allowedPreviewUrl(bucket, ORIGIN, STORAGE), bucket);
  });

  it('keeps the editor’s own blob URLs', () => {
    const blob = `blob:${ORIGIN}/0f1d2c3b-4a5e-6f70-8192-a3b4c5d6e7f8`;
    assert.equal(allowedPreviewUrl(blob, ORIGIN, STORAGE), blob);
  });

  it('drops everything else', () => {
    for (const bad of [
      'https://evil.example/x.png',
      'javascript:alert(1)',
      '//evil.example/x.png',
      'blob:https://evil.example/abc',
      `${STORAGE}/storage/v1/object/sign/originals/x.jpg`,
      'data:image/png;base64,AAAA',
      42,
    ]) {
      assert.equal(allowedPreviewUrl(bad, ORIGIN, STORAGE), undefined, String(bad));
    }
  });
});
