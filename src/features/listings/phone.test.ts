import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { displayPhone, telHref } from './phone.js';

describe('telHref', () => {
  it('turns a stored 972 number into a tel:+ link', () => {
    assert.equal(telHref('972521110001'), 'tel:+972521110001');
  });

  it('accepts a leading plus or separators', () => {
    assert.equal(telHref('+972-52-111-0001'), 'tel:+972521110001');
  });

  it('lifts a local 0-prefix into +972', () => {
    assert.equal(telHref('0521110001'), 'tel:+972521110001');
  });
});

describe('displayPhone', () => {
  it('groups a mobile as 05x-xxx-xxxx', () => {
    assert.equal(displayPhone('972521110001'), '052-111-0001');
  });

  it('groups a landline as 0x-xxx-xxxx', () => {
    assert.equal(displayPhone('97235001234'), '03-500-1234');
  });
});
