import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { classifySource } from './source.js';

const HOME = 'https://amudsell.com/';

describe('classifySource (PRICING §7)', () => {
  it('the listing credit is page_credit, whatever else is on the link', () => {
    assert.equal(classifySource(`${HOME}?src=credit`, 'https://amudsell.com/a/A7K2M/'), 'page_credit');
    assert.equal(classifySource(`${HOME}?src=credit&utm_medium=email`, ''), 'page_credit');
  });

  it('reads email and paid campaigns', () => {
    assert.equal(classifySource(`${HOME}?utm_source=newsletter`, ''), 'email');
    assert.equal(classifySource(`${HOME}?utm_medium=email`, ''), 'email');
    assert.equal(classifySource(`${HOME}?gclid=abc`, ''), 'paid');
    assert.equal(classifySource(`${HOME}?utm_medium=cpc`, ''), 'paid');
  });

  it('another site linking is a referral, a search engine is organic', () => {
    assert.equal(classifySource(HOME, 'https://www.facebook.com/groups/x'), 'referral');
    assert.equal(classifySource(`${HOME}?ref=agent12`, ''), 'referral');
    assert.equal(classifySource(HOME, 'https://www.google.com/'), 'organic');
    assert.equal(classifySource(HOME, 'https://amudsell.com/pricing/'), 'organic');
  });

  it('no clue at all is organic, and a broken URL never throws', () => {
    assert.equal(classifySource(HOME, ''), 'organic');
    assert.equal(classifySource('not a url', 'also not'), 'organic');
  });
});
