import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { licenceVerdict, normalizeLicence } from './licence.js';

describe('normalizeLicence', () => {
  it('keeps the digits people mean', () => {
    assert.equal(normalizeLicence(' 12-345 '), '12345');
    assert.equal(normalizeLicence('0012345'), '12345');
    assert.equal(normalizeLicence(12345), '12345');
  });

  it('refuses what cannot be a licence number', () => {
    assert.equal(normalizeLicence('abc'), null);
    assert.equal(normalizeLicence('12'), null);
    assert.equal(normalizeLicence(''), null);
    assert.equal(normalizeLicence(null), null);
  });
});

describe('licenceVerdict — strict, fail closed (CLAUDE.md §8)', () => {
  const ok = (records: unknown[]) => ({ success: true, result: { records } });

  it('verifies an exact match in any field', () => {
    assert.equal(licenceVerdict(ok([{ _id: 4, 'מספר רישיון': '12345', שם: 'x' }]), '12345'), 'verified');
    assert.equal(licenceVerdict(ok([{ license: 12345 }]), '0012345'), 'verified');
  });

  it('a near miss from full-text search is not a match', () => {
    assert.equal(licenceVerdict(ok([{ license: '123456' }, { phone: '0501234567' }]), '12345'), 'not_found');
    assert.equal(licenceVerdict(ok([]), '12345'), 'not_found');
  });

  it('an unexpected or failed answer is unavailable, never verified', () => {
    assert.equal(licenceVerdict({ success: false }, '12345'), 'unavailable');
    assert.equal(licenceVerdict({ success: true, result: {} }, '12345'), 'unavailable');
    assert.equal(licenceVerdict(null, '12345'), 'unavailable');
    assert.equal(licenceVerdict('<html>', '12345'), 'unavailable');
  });
});
