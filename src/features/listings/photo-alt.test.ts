import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { photoAlt } from './photo-alt.js';

describe('photoAlt', () => {
  it('prefers the seller’s alt', () => {
    assert.equal(
      photoAlt({ alt: 'סלון ומטבח פתוחים', caption: 'סלון', room: 'living' }, 'סלון'),
      'סלון ומטבח פתוחים',
    );
  });

  it('falls back to room then caption', () => {
    assert.equal(photoAlt({ caption: 'מבט דרומה', room: 'balcony' }, 'מרפסת'), 'מרפסת · מבט דרומה');
  });

  it('omits a missing piece rather than inventing one', () => {
    assert.equal(photoAlt({ room: 'kitchen' }, 'מטבח'), 'מטבח');
    assert.equal(photoAlt({ caption: 'חזית' }), 'חזית');
    assert.equal(photoAlt({}), '');
  });
});
