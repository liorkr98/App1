import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loanFor, monthlyPayment } from './loan.js';

describe('monthlyPayment — the loan calculator (19 Oct 2026)', () => {
  it('is the standard annuity', () => {
    // 1,000,000 over 25 years at 5%: 5,845.90 a month, the figure any bank table gives.
    assert.equal(Math.round(monthlyPayment(1_000_000, 5, 300)! * 100) / 100, 5845.9);
  });

  it('repays in equal parts at no interest', () => {
    assert.equal(monthlyPayment(60_000, 0, 60), 1000);
  });

  it('is nothing for what is not a loan', () => {
    for (const [principal, rate, months] of [
      [0, 5, 300],
      [-1, 5, 300],
      [1000, -1, 12],
      [1000, 31, 12],
      [1000, 5, 0],
      [Number.NaN, 5, 12],
    ] as const) {
      assert.equal(monthlyPayment(principal, rate, months), undefined, `${principal} ${rate} ${months}`);
    }
  });

  it('takes the down payment off the price first, and rounds to the shekel', () => {
    assert.equal(loanFor(1_000_000, 25, 5, 25), Math.round(monthlyPayment(750_000, 5, 300)!));
    assert.equal(loanFor(100_000, 100, 5, 5), undefined);
    assert.equal(loanFor(0, 25, 5, 25), undefined);
  });
});
