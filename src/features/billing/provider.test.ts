import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { activeProvider, asPaymentEvent, unsetProvider } from './provider.js';

const ACCOUNT = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('while no PSP is signed, nothing is paid (CLAUDE.md §8)', () => {
  it('the active provider is the unset one', () => {
    assert.equal(activeProvider().name, 'unset');
  });

  it('refuses every webhook', async () => {
    const request = new Request('https://amudsell.com/api/payments/webhook', {
      method: 'POST',
      body: JSON.stringify({ txnRef: 't1', kind: 'subscription_paid', accountId: ACCOUNT, planKey: 'agent' }),
    });
    assert.equal(await unsetProvider.verifyWebhook(request), null);
  });

  it('never reports a transaction paid', async () => {
    assert.equal((await unsetProvider.getTransaction('t1')).status, 'unknown');
  });

  it('cannot start a checkout', async () => {
    await assert.rejects(() =>
      unsetProvider.createCheckout({ reference: 'x', amountAgorot: 1, currency: 'ILS', returnUrl: 'r', cancelUrl: 'c', idempotencyKey: 'k' }),
    );
  });
});

describe('asPaymentEvent — a verified event still has to make sense', () => {
  const good = { txnRef: ' t-1 ', kind: 'subscription_paid', accountId: ACCOUNT, planKey: 'agent_launch' };

  it('accepts a well-formed event and trims the reference', () => {
    assert.deepEqual(asPaymentEvent(good), { ...good, txnRef: 't-1' });
  });

  it('refuses an unknown kind, a bad account, a missing reference', () => {
    assert.equal(asPaymentEvent({ ...good, kind: 'refund_everything' }), null);
    assert.equal(asPaymentEvent({ ...good, accountId: 'me' }), null);
    assert.equal(asPaymentEvent({ ...good, txnRef: '' }), null);
    assert.equal(asPaymentEvent({ ...good, planKey: 'Agent; drop table' }), null);
    assert.equal(asPaymentEvent({ ...good, amountAgorot: -5 }), null);
    assert.equal(asPaymentEvent(null), null);
  });
});
