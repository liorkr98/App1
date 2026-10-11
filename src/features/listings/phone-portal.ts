/**
 * Upload from your phone — the parts that decide what is let in
 * (supabase/migrations/0036_phone_portal.sql has the why).
 *
 * Pure, so the rules are tested where they are written rather than through a
 * Worker nobody can run here.
 */

/** 32 hex characters from each of two v4 UUIDs, as 0036 makes them. */
export function isPortalToken(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

/** SHA-256 as lowercase hex — what 0036 stores, computed the same way. */
export async function hashPortalToken(token: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Per photograph, after the phone's re-encode (1600 px WebP: ~150–600 KB). */
export const PHONE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export type WebpCheck = { ok: true } | { ok: false; reason: 'not_webp' | 'metadata' | 'malformed' };

const fourcc = (bytes: Uint8Array, at: number) =>
  String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);

const u32le = (bytes: Uint8Array, at: number) =>
  (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16)) + bytes[at + 3]! * 0x1000000;

/**
 * A WebP with no EXIF and no XMP — the second guard on CLAUDE.md §9.
 *
 * The first guard is the phone: listing-photo.ts redraws every photograph on
 * a canvas, and a canvas has no metadata to carry. But this route accepts
 * bytes from a device that is not signed in, so it checks what it was sent
 * rather than trusting how it was made. The container is a RIFF list of
 * chunks; GPS can only ride in an `EXIF` or `XMP ` chunk.
 */
export function checkWebp(bytes: Uint8Array): WebpCheck {
  if (bytes.length < 20 || fourcc(bytes, 0) !== 'RIFF' || fourcc(bytes, 8) !== 'WEBP') {
    return { ok: false, reason: 'not_webp' };
  }
  let at = 12;
  let chunks = 0;
  while (at + 8 <= bytes.length) {
    const id = fourcc(bytes, at);
    const size = u32le(bytes, at + 4);
    if (id === 'EXIF' || id === 'XMP ') return { ok: false, reason: 'metadata' };
    const next = at + 8 + size + (size % 2);
    if (next > bytes.length) return { ok: false, reason: 'malformed' };
    at = next;
    chunks += 1;
  }
  return chunks > 0 && at === bytes.length ? { ok: true } : { ok: false, reason: 'malformed' };
}

/**
 * Where a phone's photograph is stored: under `{listingId}/browser/`, the
 * prefix every browser-made public copy lives under (0023), named so it can
 * never collide with a worker output or another upload.
 */
export function phoneUploadPath(listingId: string, now: number, random: string): string {
  const tail = random.replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'x';
  return `${listingId}/browser/phone-${now}-${tail}.webp`;
}

/** A dimension the inbox will accept (0036's check constraint). */
export function isDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 4000;
}
