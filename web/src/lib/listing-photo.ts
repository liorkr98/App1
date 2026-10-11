import { supabase } from './supabase';
import type { ProcessedPhoto } from './photo-strip';

// The re-encode lives in photo-strip.ts (no database client in it, so the
// phone page can import it alone). Re-exported: the editor imports it here.
export { stripAndResize, type ProcessedPhoto } from './photo-strip';

/**
 * Where the public copy of one photograph lives.
 *
 * ======================= `browser/` IS NOT DECORATION =======================
 * The write policy on this bucket requires the SECOND path segment to be
 * exactly `browser` (migration 0023). This code wrote `{listingId}/{file}` and
 * every upload was refused:
 *
 *   403 new row violates row-level security policy   ->   HTTP 400
 *
 * The editor read that error, recorded "this photo has no URL yet", and
 * carried on. So the originals were saved, no public copy existed, `media`
 * stayed empty, and the seller published a listing whose page could not be
 * built — which is exactly what an agent reported and what /a/G5Y3A/ was.
 *
 * The prefix is the right rule and the code was the wrong half: it keeps a
 * browser from ever writing over something the worker produced, including the
 * WhatsApp card at `og/{listingId}-{hash}.webp`, which is the one file in the
 * system most worth protecting (CLAUDE.md §6).
 *
 * Verified against the live project by attempting the upload both ways, not
 * inferred from the policy text.
 * ===========================================================================
 *
 * NAMED AFTER THE ORIGINAL, not after the editor's own photo id. That id is
 * `${file.name}:${file.size}:${file.lastModified}:${random}` — built to be
 * unique in a React list, not to be an object key, and it put colons and a
 * second dot into one. The original's path is already sanitised by
 * `originalPath` and already unique: it carries a timestamp.
 */
export function derivedPath(listingId: string, sourcePath: string): string {
  const name = sourcePath.split('/').pop() ?? '';
  const stem = name.replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-');

  // Empty only if the caller had no original path at all, which would mean the
  // upload it belongs to never happened.
  return `${listingId}/browser/${stem || Date.now()}.webp`;
}

/**
 * Uploads the public copy and returns its URL.
 *
 * The path's FIRST SEGMENT IS THE LISTING ID, which is what every storage
 * policy keys off (0004). The filename is not the seller's: their filename can
 * carry slashes, which would place the object outside the listing's folder and
 * straight past the policy's first-segment check.
 */
export async function uploadDerived(
  listingId: string,
  sourcePath: string,
  processed: ProcessedPhoto,
): Promise<{ url: string } | { error: string }> {
  const client = supabase();
  const path = derivedPath(listingId, sourcePath);

  const { error } = await client.storage.from('derived').upload(path, processed.blob, {
    contentType: 'image/webp',
    // A seller who replaces a photograph keeps the same id, and the second
    // upload must win rather than fail.
    upsert: true,
    cacheControl: '31536000',
  });

  if (error) return { error: error.message };

  const { data } = client.storage.from('derived').getPublicUrl(path);
  return { url: data.publicUrl };
}
