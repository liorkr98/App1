import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isPreviewScraper } from './scrapers.js';

describe('isPreviewScraper', () => {
  it('filters WhatsApp preview fetches', () => {
    assert.equal(
      isPreviewScraper('WhatsApp/2.23.20.0 A'),
      true,
    );
  });

  it('filters facebookexternalhit', () => {
    assert.equal(
      isPreviewScraper('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'),
      true,
    );
  });

  it('lets a phone browser through', () => {
    assert.equal(
      isPreviewScraper(
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
      ),
      false,
    );
  });

  it('does not treat a missing UA as a scraper', () => {
    assert.equal(isPreviewScraper(null), false);
    assert.equal(isPreviewScraper(''), false);
  });
});
