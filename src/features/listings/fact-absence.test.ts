import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { absenceIsStated } from './fact-absence.js';

describe('absence rendering', () => {
  it('lets only a boolean say אין', () => {
    assert.equal(absenceIsStated('boolean'), true);
  });

  it('omits an empty date, number, text or enum instead of negating it', () => {
    assert.equal(absenceIsStated('date'), false);
    assert.equal(absenceIsStated('number'), false);
    assert.equal(absenceIsStated('text'), false);
    assert.equal(absenceIsStated('enum'), false);
    assert.equal(absenceIsStated(undefined), false);
  });
});
