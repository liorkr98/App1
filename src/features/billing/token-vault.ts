/**
 * The card token, sealed before it reaches the database (migration 0049).
 *
 * Tranzila's token stands in for the card number and works only with our
 * terminal, so it is not card data. It is still the thing that charges an
 * agent every month, so the database holds it sealed: AES-256-GCM with a key
 * that lives only in the Worker (PAYMENT_TOKEN_KEY), bound to the account it
 * belongs to. A copy of the table, or a row moved to another account, opens
 * to nothing.
 *
 * Format: v1.<iv base64>.<ciphertext base64>. Web Crypto only, so the same
 * code runs in the Worker and in the tests.
 */

const VERSION = 'v1';
const TOKEN = /^[A-Za-z0-9]{8,64}$/;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function fromBase64(value: string): Uint8Array | undefined {
  try {
    const text = atob(value);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
    return bytes;
  } catch {
    return undefined;
  }
}

async function importKey(keyBase64: string) {
  const raw = fromBase64(keyBase64.trim());
  if (!raw || raw.length !== 32) throw new Error('PAYMENT_TOKEN_KEY must be 32 bytes, base64');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Seals a token for one account. Throws on a token that does not look like one. */
export async function sealToken(token: string, accountId: string, keyBase64: string): Promise<string> {
  if (!TOKEN.test(token)) throw new Error('not a card token');
  const key = await importKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(accountId) },
    key,
    encoder.encode(token),
  );
  return `${VERSION}.${toBase64(iv)}.${toBase64(new Uint8Array(sealed))}`;
}

/** The token, or undefined when the seal, the key or the account does not match. */
export async function openToken(sealed: string, accountId: string, keyBase64: string): Promise<string | undefined> {
  const [version, ivPart, dataPart] = sealed.split('.');
  if (version !== VERSION || !ivPart || !dataPart) return undefined;
  const iv = fromBase64(ivPart);
  const data = fromBase64(dataPart);
  if (!iv || iv.length !== 12 || !data) return undefined;
  try {
    const key = await importKey(keyBase64);
    const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(accountId) }, key, data);
    return new TextDecoder().decode(opened);
  } catch {
    return undefined;
  }
}
