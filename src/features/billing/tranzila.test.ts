import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';

import { openToken, sealToken } from './token-vault.js';
import {
  agorotOf,
  apiHeaders,
  checkPayment,
  handshake,
  lookupTransaction,
  readHint,
  sha256Hex,
  sumOf,
  windowUrl,
  type Fetch,
  type PaymentHint,
  type TransactionRecord,
} from './tranzila.js';

const CONFIG = { terminal: 'amudsell', appKey: 'app-key', secret: 'secret' };
const SESSION = '0f8fad5b-d9cb-469f-a165-70867728950e';
const NONCE = 'a'.repeat(64);
const KEY = Buffer.alloc(32, 7).toString('base64');

const reply = (body: unknown, status = 200): Fetch => async () =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

describe('Tranzila API authentication', () => {
  it('signs the app key with secret + time + nonce, HMAC-SHA256', async () => {
    const headers = await apiHeaders('app', 'sec', 1700000000, 'n1');
    const expected = createHmac('sha256', 'sec1700000000n1').update('app').digest('hex');
    assert.equal(headers['X-tranzila-api-access-token'], expected);
    assert.equal(headers['X-tranzila-api-request-time'], '1700000000');
  });
});

describe('sums, exactly', () => {
  it('writes agorot as shekels and reads them back', () => {
    assert.equal(sumOf(3422), '34.22');
    assert.equal(sumOf(990), '9.90');
    assert.equal(agorotOf('34.22'), 3422);
    assert.equal(agorotOf('9.9'), 990);
    assert.equal(agorotOf(19), 1900);
  });

  it('refuses anything that is not a plain sum', () => {
    assert.throws(() => sumOf(0));
    assert.throws(() => sumOf(12.5));
    assert.equal(agorotOf('34.221'), undefined);
    assert.equal(agorotOf('-5'), undefined);
    assert.equal(agorotOf('1e3'), undefined);
  });
});

describe('the handshake locks the amount', () => {
  it('reads thtk from JSON or from a query string', async () => {
    assert.equal(await handshake(CONFIG, 3422, reply({ thtk: 'abcDEF123456' })), 'abcDEF123456');
    assert.equal(await handshake(CONFIG, 3422, reply('thtk=abcDEF123456')), 'abcDEF123456');
  });

  it('gives nothing on an error, so no window opens', async () => {
    assert.equal(await handshake(CONFIG, 3422, reply('nope', 500)), undefined);
    assert.equal(await handshake(CONFIG, 3422, reply({ error: 'x' })), undefined);
    assert.equal(await handshake(CONFIG, 3422, async () => { throw new Error('down'); }), undefined);
  });
});

describe('the payment window', () => {
  it('keeps a token only for a subscription, and carries the session back', () => {
    const base = { sessionId: SESSION, nonce: NONCE, amountAgorot: 3422, thtk: 'tk', notifyUrl: 'https://amudsell.com/api/payments/webhook', doneUrl: 'https://amudsell.com/api/payments/done?s=1', description: 'plan' };
    const sub = new URL(windowUrl(CONFIG, { ...base, keepToken: true }));
    assert.equal(sub.origin, 'https://direct.tranzila.com');
    assert.equal(sub.searchParams.get('tranmode'), 'AK');
    assert.equal(sub.searchParams.get('sum'), '34.22');
    assert.equal(sub.searchParams.get('ls_session'), SESSION);
    assert.ok(sub.searchParams.get('pdesc')?.includes(SESSION));
    assert.equal(sub.searchParams.get('fail_url_address'), 'https://amudsell.com/api/payments/done?s=1&failed=1');
    assert.equal(new URL(windowUrl(CONFIG, { ...base, keepToken: false })).searchParams.get('tranmode'), 'A');
  });
});

describe('a result is only a hint', () => {
  const params = new URLSearchParams({ ls_session: SESSION, ls_nonce: NONCE, index: '12345', TranzilaTK: 'TOKEN1234567890', expmonth: '12', expyear: '30', ccno: '458045******4580' });

  it('reads the session, the index, the token and the last four digits', () => {
    assert.deepEqual(readHint(params), { sessionId: SESSION, nonce: NONCE, index: '12345', token: 'TOKEN1234567890', expMonth: 12, expYear: 2030, last4: '4580' });
  });

  it('ignores a result without a valid session, nonce or index', () => {
    for (const name of ['ls_session', 'ls_nonce', 'index']) {
      const broken = new URLSearchParams(params);
      broken.set(name, 'x');
      assert.equal(readHint(broken), undefined, name);
    }
  });
});

describe('checkPayment — the one rule (CLAUDE.md §8)', () => {
  const session = { id: SESSION, amount_agorot: 3422, nonce_hash: '' };
  const hint: PaymentHint = { sessionId: SESSION, nonce: NONCE, index: '12345', token: 'TOKEN1234567890' };
  const record: TransactionRecord = { index: '12345', approved: true, amountAgorot: 3422, token: undefined, text: `{"pdesc":"plan ${SESSION}"}` };

  it('confirms an approved transaction for this amount and this session', async () => {
    session.nonce_hash = await sha256Hex(NONCE);
    assert.deepEqual(await checkPayment(session, hint, record, true), { ok: true, token: 'TOKEN1234567890' });
  });

  it('never takes the token from a browser', async () => {
    assert.deepEqual(await checkPayment(session, hint, record, false), { ok: true, token: undefined });
  });

  it('refuses every way the facts could differ', async () => {
    const cases: [string, PaymentHint, TransactionRecord | undefined][] = [
      ['session_mismatch', { ...hint, sessionId: '1f8fad5b-d9cb-469f-a165-70867728950e' }, record],
      ['nonce_mismatch', { ...hint, nonce: 'b'.repeat(64) }, record],
      ['not_confirmed', hint, undefined],
      ['index_mismatch', hint, { ...record, index: '999' }],
      ['not_approved', hint, { ...record, approved: false }],
      ['amount_mismatch', hint, { ...record, amountAgorot: 100 }],
      ['reference_missing', hint, { ...record, text: '{"pdesc":"another session"}' }],
      ['token_mismatch', hint, { ...record, token: 'OTHERTOKEN123' }],
    ];
    for (const [reason, h, r] of cases) {
      assert.deepEqual(await checkPayment(session, h, r, true), { ok: false, reason }, reason);
    }
  });
});

describe('lookupTransaction', () => {
  it('reads one approved transaction', async () => {
    const found = await lookupTransaction(CONFIG, '12345', reply({ transactions: [{ index: 12345, processor_response_code: '000', amount: '34.22', pdesc: SESSION }] }));
    assert.equal(found?.approved, true);
    assert.equal(found?.amountAgorot, 3422);
  });

  it('knows nothing when Tranzila is down, answers oddly, or names two', async () => {
    assert.equal(await lookupTransaction(CONFIG, '1', reply('down', 503)), undefined);
    assert.equal(await lookupTransaction(CONFIG, '1', reply({ transactions: [] })), undefined);
    assert.equal(await lookupTransaction(CONFIG, '1', reply({ transactions: [{ index: '1' }, { index: '1' }] })), undefined);
    assert.equal((await lookupTransaction(CONFIG, '1', reply({ transactions: [{ index: '1', processor_response_code: '033' }] })))?.approved, false);
  });
});

describe('the sealed token', () => {
  const ACCOUNT = '0f8fad5b-d9cb-469f-a165-70867728950e';

  it('opens for its own account and key', async () => {
    const sealed = await sealToken('TOKEN1234567890', ACCOUNT, KEY);
    assert.match(sealed, /^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
    assert.equal(await openToken(sealed, ACCOUNT, KEY), 'TOKEN1234567890');
  });

  it('opens to nothing under another account, another key, or after tampering', async () => {
    const sealed = await sealToken('TOKEN1234567890', ACCOUNT, KEY);
    assert.equal(await openToken(sealed, '1f8fad5b-d9cb-469f-a165-70867728950e', KEY), undefined);
    assert.equal(await openToken(sealed, ACCOUNT, Buffer.alloc(32, 8).toString('base64')), undefined);
    const [v, iv, data] = sealed.split('.');
    const flipped = data!.startsWith('A') ? `B${data!.slice(1)}` : `A${data!.slice(1)}`;
    assert.equal(await openToken(`${v}.${iv}.${flipped}`, ACCOUNT, KEY), undefined);
  });

  it('refuses a short key and something that is not a token', async () => {
    await assert.rejects(() => sealToken('TOKEN1234567890', ACCOUNT, Buffer.alloc(16).toString('base64')));
    await assert.rejects(() => sealToken('not a token!', ACCOUNT, KEY));
  });
});
