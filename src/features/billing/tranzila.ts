/**
 * Tranzila, the payments provider (chosen 19 Oct 2026; never Stripe,
 * CLAUDE.md §2). Everything that knows Tranzila's names is in this file.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8. The one rule: a payment counts only when Tranzila itself,
 * asked server to server with our API keys, says the transaction was
 * approved, for the session's amount, and carries the session's id. What
 * the browser or the notification says is a hint for which transaction to
 * look up, never a fact (checkPayment below).
 * ======================================================================
 *
 * CONFIRM ON THE TEST TERMINAL. Tranzila's documentation site could not be
 * opened from the machine this was written on; the endpoint paths and field
 * names below come from its official pages as quoted by search results, and
 * each one is listed in docs/PAYMENTS.md to be checked against the test
 * terminal before payments_mode leaves 'test'. Every check fails closed: a
 * field under another name means a payment is not confirmed, never that one
 * is confirmed wrongly.
 *
 * Card details never reach us: the agent types them in Tranzila's own
 * payment window, inside our page (PCI SAQ-A). We receive a token.
 */

export interface TranzilaConfig {
  /** The terminal the payment window charges and makes tokens on. */
  terminal: string;
  /** API v1 credentials, from Tranzila. Worker secrets only. */
  appKey: string;
  secret: string;
}

export const TRANZILA = {
  api: 'https://api.tranzila.com',
  /** Locks the amount before the window opens (handshake, thtk, 20 minutes). */
  handshakePath: '/v1/handshake/create',
  /** Transactions by index, for the confirmation. */
  transactionsPath: '/v1/transactions',
  iframe: (terminal: string) => `https://direct.tranzila.com/${encodeURIComponent(terminal)}/iframenew.php`,
  /** ILS. */
  currency: '1',
} as const;

/** A fetch, injectable for the tests. */
export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const encoder = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NONCE = /^[0-9a-f]{64}$/;

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function randomHex(bytes: number): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

/** Compares two hex strings without stopping at the first difference. */
export function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Tranzila API v1 authentication: the app key, the time, a one-off nonce,
 * and an HMAC-SHA256 of the app key keyed with secret + time + nonce.
 */
export async function apiHeaders(appKey: string, secret: string, nowSeconds: number, nonce: string): Promise<Record<string, string>> {
  const time = String(Math.floor(nowSeconds));
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret + time + nonce), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const token = toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(appKey)));
  return {
    'X-tranzila-api-app-key': appKey,
    'X-tranzila-api-request-time': time,
    'X-tranzila-api-nonce': nonce,
    'X-tranzila-api-access-token': token,
  };
}

/** Agorot as Tranzila writes a sum: 3422 → "34.22". */
export function sumOf(agorot: number): string {
  if (!Number.isInteger(agorot) || agorot <= 0) throw new Error('amount must be positive agorot');
  return `${Math.floor(agorot / 100)}.${String(agorot % 100).padStart(2, '0')}`;
}

/** "34.22" → 3422, exactly. Undefined for anything else. */
export function agorotOf(sum: unknown): number | undefined {
  const text = typeof sum === 'number' ? String(sum) : typeof sum === 'string' ? sum.trim() : '';
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return undefined;
  return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
}

/** The handshake token that locks this amount for the window. Undefined on any failure. */
export async function handshake(config: TranzilaConfig, amountAgorot: number, fetchFn: Fetch, nowSeconds = Date.now() / 1000): Promise<string | undefined> {
  const query = new URLSearchParams({ supplier: config.terminal, sum: sumOf(amountAgorot) });
  try {
    const response = await fetchFn(`${TRANZILA.api}${TRANZILA.handshakePath}?${query}`, {
      headers: await apiHeaders(config.appKey, config.secret, nowSeconds, randomHex(20)),
    });
    if (!response.ok) return undefined;
    const text = await response.text();
    let thtk: unknown;
    try {
      thtk = (JSON.parse(text) as { thtk?: unknown }).thtk;
    } catch {
      thtk = /(?:^|&)thtk=([A-Za-z0-9]+)/.exec(text)?.[1];
    }
    return typeof thtk === 'string' && /^[A-Za-z0-9]{8,128}$/.test(thtk) ? thtk : undefined;
  } catch {
    return undefined;
  }
}

export interface WindowInput {
  sessionId: string;
  /** The random value whose hash is on the session row. */
  nonce: string;
  amountAgorot: number;
  thtk: string;
  /** A subscription keeps a token for the monthly charge; a one-time page does not. */
  keepToken: boolean;
  /** Absolute https URLs on our own site. */
  notifyUrl: string;
  doneUrl: string;
  description: string;
}

/** The payment window's address. Tranzila sends ls_session and ls_nonce back with the result. */
export function windowUrl(config: TranzilaConfig, input: WindowInput): string {
  const params = new URLSearchParams({
    sum: sumOf(input.amountAgorot),
    currency: TRANZILA.currency,
    tranmode: input.keepToken ? 'AK' : 'A',
    thtk: input.thtk,
    new_process: '1',
    lang: 'il',
    // The session id also rides in the description, a field every
    // transaction record keeps, so the confirmation can find it there.
    pdesc: `${input.description} ${input.sessionId}`,
    notify_url_address: input.notifyUrl,
    success_url_address: input.doneUrl,
    fail_url_address: `${input.doneUrl}${input.doneUrl.includes('?') ? '&' : '?'}failed=1`,
    ls_session: input.sessionId,
    ls_nonce: input.nonce,
  });
  return `${TRANZILA.iframe(config.terminal)}?${params}`;
}

/** What a result (Tranzila's notification, or the window's return) says. A hint, not a fact. */
export interface PaymentHint {
  sessionId: string;
  nonce: string;
  /** Tranzila's transaction index: what we look up. */
  index: string;
  token?: string;
  expMonth?: number;
  expYear?: number;
  last4?: string;
}

const pick = (params: URLSearchParams, ...names: string[]) => {
  for (const name of names) {
    const value = params.get(name);
    if (value !== null && value.trim() !== '') return value.trim();
  }
  return undefined;
};

export function readHint(params: URLSearchParams): PaymentHint | undefined {
  const sessionId = pick(params, 'ls_session');
  const nonce = pick(params, 'ls_nonce');
  const index = pick(params, 'index', 'Index');
  if (!sessionId || !UUID.test(sessionId) || !nonce || !NONCE.test(nonce) || !index || !/^\d{1,20}$/.test(index)) return undefined;
  const token = pick(params, 'TranzilaTK');
  const month = Number(pick(params, 'expmonth'));
  const yearRaw = Number(pick(params, 'expyear'));
  const year = yearRaw > 0 && yearRaw < 100 ? 2000 + yearRaw : yearRaw;
  const last4 = /(\d{4})$/.exec(pick(params, 'ccno') ?? '')?.[1];
  return {
    sessionId: sessionId.toLowerCase(),
    nonce,
    index,
    ...(token && /^[A-Za-z0-9]{8,64}$/.test(token) ? { token } : {}),
    ...(Number.isInteger(month) && month >= 1 && month <= 12 ? { expMonth: month } : {}),
    ...(Number.isInteger(year) && year >= 2000 && year <= 2100 ? { expYear: year } : {}),
    ...(last4 ? { last4 } : {}),
  };
}

/** One transaction as Tranzila reports it, reduced to what the check reads. */
export interface TransactionRecord {
  index: string;
  approved: boolean;
  amountAgorot: number | undefined;
  token: string | undefined;
  /** Every string in the record, to find the session id in whatever field kept it. */
  text: string;
}

function asRecord(row: Record<string, unknown>): TransactionRecord {
  const code = row.processor_response_code ?? row.response_code ?? row.Response ?? row.transaction_result;
  return {
    index: String(row.index ?? row.transaction_index ?? row.id ?? ''),
    approved: code === '000' || code === 0 || code === '0' || code === 'approved',
    amountAgorot: agorotOf(row.amount ?? row.sum ?? row.total),
    token: typeof (row.token ?? row.TranzilaTK) === 'string' ? String(row.token ?? row.TranzilaTK) : undefined,
    text: JSON.stringify(row),
  };
}

/** Asks Tranzila for one transaction on our terminal. Undefined when it cannot say. */
export async function lookupTransaction(config: TranzilaConfig, index: string, fetchFn: Fetch, nowSeconds = Date.now() / 1000): Promise<TransactionRecord | undefined> {
  try {
    const response = await fetchFn(`${TRANZILA.api}${TRANZILA.transactionsPath}`, {
      method: 'POST',
      headers: { ...(await apiHeaders(config.appKey, config.secret, nowSeconds, randomHex(20))), 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminal_name: config.terminal, transaction_index: index }),
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { transactions?: unknown };
    const rows = Array.isArray(body.transactions) ? body.transactions : [];
    const matches = rows
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
      .map(asRecord)
      .filter((record) => record.index === index);
    // Exactly one, or we do not know which one this is.
    return matches.length === 1 ? matches[0] : undefined;
  } catch {
    return undefined;
  }
}

export interface SessionRow {
  id: string;
  amount_agorot: number;
  nonce_hash: string;
}

export type CheckResult = { ok: true; token: string | undefined } | { ok: false; reason: string };

/**
 * The decision. Every condition must hold, from what Tranzila said server to
 * server; the hint only chose which transaction to ask about.
 */
export async function checkPayment(session: SessionRow, hint: PaymentHint, record: TransactionRecord | undefined, trustHintToken: boolean): Promise<CheckResult> {
  if (hint.sessionId !== session.id.toLowerCase()) return { ok: false, reason: 'session_mismatch' };
  if (!sameHex(await sha256Hex(hint.nonce), session.nonce_hash)) return { ok: false, reason: 'nonce_mismatch' };
  if (!record) return { ok: false, reason: 'not_confirmed' };
  if (record.index !== hint.index) return { ok: false, reason: 'index_mismatch' };
  if (!record.approved) return { ok: false, reason: 'not_approved' };
  if (record.amountAgorot !== session.amount_agorot) return { ok: false, reason: 'amount_mismatch' };
  // The session id rides on the transaction itself, so another customer's
  // approved payment cannot be pointed at this session.
  if (!record.text.toLowerCase().includes(session.id.toLowerCase())) return { ok: false, reason: 'reference_missing' };
  if (record.token && hint.token && record.token !== hint.token) return { ok: false, reason: 'token_mismatch' };
  // The token: Tranzila's own record first; the notification's only when it
  // came server to server, never from a browser address bar.
  return { ok: true, token: record.token ?? (trustHintToken ? hint.token : undefined) };
}
