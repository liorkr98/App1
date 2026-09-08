import sharp, { type Sharp } from 'sharp';

import { db } from './db.js';
import { JobFailure } from './types.js';

/**
 * Storage access.
 *
 * Two buckets, and the split is the security boundary (see 0004_storage.sql):
 * `originals` is private and holds what the phone uploaded, EXIF and all;
 * `derived` is public and holds only pipeline output.
 */

export const ORIGINALS = 'originals';
export const DERIVED = 'derived';

/**
 * Rejects a storage path that is not inside this listing's own folder.
 *
 * THIS IS A SECURITY BOUNDARY, not a tidiness check.
 *
 * Job payloads carry source paths and the client supplies them. The worker
 * downloads with the service role, which bypasses RLS — so without this a user
 * could enqueue a job on their OWN listing whose sources point at another
 * listing's originals, and the pipeline would happily process a stranger's
 * photo and publish it to the public `derived` bucket.
 *
 * The RLS policies on `originals` do not help here: they constrain the client,
 * and the client is not the one doing the reading.
 */
export function assertWithinListing(listingId: string, path: string): void {
  const [folder, ...rest] = path.split('/');

  if (folder !== listingId || rest.length === 0) {
    throw new JobFailure('path_outside_listing', false);
  }

  // A traversal segment could climb back out of the folder the prefix check
  // just established.
  if (path.includes('..')) {
    throw new JobFailure('path_outside_listing', false);
  }
}

export async function download(bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await db().storage.from(bucket).download(path);
  if (error || !data) {
    throw new JobFailure('source_unreadable', false);
  }
  return Buffer.from(await data.arrayBuffer());
}

/** The only sanctioned way to read an original. Always scoped to the listing. */
export async function downloadOriginal(listingId: string, path: string): Promise<Buffer> {
  assertWithinListing(listingId, path);
  return download(ORIGINALS, path);
}

export async function upload(
  path: string,
  body: Buffer,
  contentType: string,
): Promise<{ path: string; publicUrl: string }> {
  const { error } = await db()
    .storage.from(DERIVED)
    .upload(path, body, { contentType, upsert: true });

  if (error) {
    // Storage 5xx and timeouts are worth retrying; a rejected upload usually
    // is not, but we cannot tell them apart from here, so retry and let
    // max_attempts stop it.
    throw new JobFailure('upload_failed', true);
  }

  const { data } = db().storage.from(DERIVED).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

/**
 * Strips every metadata block from an image.
 *
 * A listing photo of someone's home carries GPS coordinates in EXIF. Publish
 * that and the address is public even when the seller chose to hide the
 * street, and even when the page is noindex — which makes it a privacy leak,
 * not a nicety (CLAUDE.md §8, Stage D6).
 *
 * sharp drops all metadata unless `withMetadata()` is called, so this is
 * really a guarantee that nothing downstream reintroduces it. The explicit
 * rotate() applies the EXIF orientation to the pixels FIRST — otherwise
 * dropping the tag would leave the image sideways.
 */
export function stripMetadata(input: Sharp): Sharp {
  return input.rotate();
}

/** True when the buffer still carries EXIF. Used by the D6 acceptance check. */
export async function hasExif(buffer: Buffer): Promise<boolean> {
  const metadata = await sharp(buffer).metadata();
  return Boolean(metadata.exif ?? metadata.icc ?? metadata.iptc ?? metadata.xmp);
}
