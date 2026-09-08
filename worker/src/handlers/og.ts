import { createHash } from 'node:crypto';
import sharp from 'sharp';

import { db } from '../db.js';
import { downloadOriginal, stripMetadata, upload } from '../storage.js';
import { JobFailure, type JobContext } from '../types.js';

/**
 * D4 — the Open Graph image.
 *
 * The single highest-leverage asset in the product. The page is distributed by
 * WhatsApp link, so this 1200x630 crop is what decides whether anyone opens
 * the listing at all.
 */

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const MAX_BYTES = 300 * 1024;

/**
 * Quality ladder. WebP at 82 is usually well under 300KB at this size, but a
 * busy photograph can exceed it, so we step down rather than ship something
 * the scraper may refuse.
 */
const QUALITY_STEPS = [82, 72, 62, 52] as const;

interface OgPayload {
  /** Path in `originals` of the cover photo. */
  cover?: string;
  price?: number;
}

export async function generateOg({ job, progress }: JobContext): Promise<Record<string, unknown>> {
  const { cover, price } = job.payload as OgPayload;

  if (!cover) {
    throw new JobFailure('no_cover', false);
  }

  const original = await downloadOriginal(job.listing_id, cover);
  await progress(30);

  // Content hash over what a viewer would notice changing. Cover and price are
  // exactly what the card shows, so a change to either must produce a new
  // filename.
  const hash = createHash('sha256')
    .update(original)
    .update(String(price ?? ''))
    .digest('hex')
    .slice(0, 8);

  // 'attention' crops toward the busiest region rather than the centre. On a
  // 4:5 room photo a centre crop of a 1200x630 slice frequently lands on bare
  // floor; attention finds the window or the furniture.
  const base = stripMetadata(sharp(original)).resize({
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fit: 'cover',
    position: sharp.strategy.attention,
  });

  // Encode at the top quality first, then step down only while we are over
  // budget. If even the last step is over, we still ship it: an oversize card
  // is a card, and failing the job would leave the link with no preview at all.
  const [best, ...fallbacks] = QUALITY_STEPS;
  let body = await base.clone().webp({ quality: best }).toBuffer();

  for (const quality of fallbacks) {
    if (body.byteLength <= MAX_BYTES) break;
    body = await base.clone().webp({ quality }).toBuffer();
  }

  await progress(70);

  // The hash goes in the FILENAME, never a query parameter. WhatsApp caches
  // preview cards hard and some scrapers strip query strings entirely, so
  // ?v=2 busts nothing — the seller edits their price and the stale card is
  // served for days. A new filename is a new resource.
  const { publicUrl } = await upload(
    `og/${job.listing_id}-${hash}.webp`,
    body,
    'image/webp',
  );

  // Publishing this hash is what switches the page from the cover-photo
  // fallback to the real crop. web/src/lib/og.ts reads it.
  const { error } = await db()
    .from('listings')
    .update({ og_image_hash: hash })
    .eq('id', job.listing_id);

  if (error) {
    throw new JobFailure('listing_update_failed', true);
  }

  await progress(100);

  return { hash, url: publicUrl, bytes: body.byteLength };
}
