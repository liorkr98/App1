import {
  CARD_MAX_BYTES,
  CARD_QUALITIES,
  shareImagePath,
  type ShareImageKind,
} from '@/features/listings/card-layout';
import { cardFor, shareCardKey } from '@/features/listings/share-card';
import type { Listing } from '@/types/listing';

import { listingFromRow, LISTING_COLUMNS, type ListingRow } from './listing-from-row';
import { drawCard, drawStory, encode, loadCover, loadShareFonts } from './share-draw';
import { supabase } from './supabase';

/**
 * Makes the WhatsApp card and the story image in this browser, uploads them,
 * and records them on the listing.
 *
 * This replaces the render_card and render_story jobs, which ran Puppeteer on
 * Fly.io until Fly was shut down (6 October 2026). It runs when the agent
 * publishes and from the dashboard's Share Studio; the agent's phone is the
 * only machine left that can draw, and it is already holding the photograph.
 *
 * The listing is read back from the ROW and built with the same
 * listingFromRow the page uses, so the key computed here is the key the page
 * computes (share-card.ts): the card is only ever advertised while it shows
 * what the page shows.
 *
 * Never throws and never blocks anything. A listing without a card is still
 * a listing: the page advertises the cover photograph until one exists.
 */
export interface ShareImagesResult {
  status: 'made' | 'current' | 'failed';
  storyUrl?: string;
}

const FAILED: ShareImagesResult = { status: 'failed' };

export async function makeShareImages(listingId: string): Promise<ShareImagesResult> {
  try {
    const client = supabase();
    const { data, error } = await client.from('listings').select(LISTING_COLUMNS).eq('id', listingId).maybeSingle();
    if (error || !data) return FAILED;
    const row = data as unknown as ListingRow;
    const listing = listingFromRow(row);
    if (!listing || listing.status !== 'published') return FAILED;

    const key = shareCardKey(listing);
    const media = (typeof row.media === 'object' && row.media !== null ? row.media : {}) as Record<string, unknown>;
    const story = typeof media.storyUrl === 'string' ? media.storyUrl : '';
    if (cardFor(media.card)?.key === key && story.includes(`-${key}.`)) return { status: 'current', storyUrl: story };

    const [cover] = await Promise.all([loadCover(listing.media.cover.url), loadShareFonts()]);

    const card = await upload(listing, 'card', key, (canvas) => drawCard(canvas, listing, cover), true);
    const storyUrl = await upload(
      listing,
      'story',
      key,
      (canvas) => drawStory(canvas, listing, cover, window.location.host),
      false,
    );
    if (!card && !storyUrl) return FAILED;

    /*
     * Re-read `media` immediately before writing, and change only these two
     * keys: a save from another tab in the meantime keeps its photographs.
     */
    const { data: fresh } = await client.from('listings').select('media').eq('id', listingId).maybeSingle();
    const current = (fresh as { media?: unknown } | null)?.media;
    const base = typeof current === 'object' && current !== null ? (current as Record<string, unknown>) : media;
    const { error: writeError } = await client
      .from('listings')
      .update({
        media: {
          ...base,
          ...(card ? { card: { url: card, key } } : {}),
          ...(storyUrl ? { storyUrl } : {}),
        },
      })
      .eq('id', listingId);
    if (writeError) return FAILED;
    return { status: 'made', ...(storyUrl ? { storyUrl } : {}) };
  } catch {
    // Visible to the agent who can act on it; no plate, phone or address.
    console.warn('share images failed');
    return FAILED;
  }
}

async function upload(
  listing: Listing,
  kind: ShareImageKind,
  key: string,
  draw: (canvas: HTMLCanvasElement) => void,
  capped: boolean,
): Promise<string | undefined> {
  try {
    const canvas = document.createElement('canvas');
    draw(canvas);

    // CLAUDE.md §6: the card is under 300 KB. Step the quality down until it
    // is; an oversize card still ships — a card is better than none.
    let encoded = await encode(canvas, CARD_QUALITIES[0]);
    if (capped) {
      for (const quality of CARD_QUALITIES.slice(1)) {
        if (encoded.blob.size <= CARD_MAX_BYTES) break;
        encoded = await encode(canvas, quality);
      }
    }

    const path = shareImagePath(listing.id, kind, listing.slug, key, encoded.extension);
    const storage = supabase().storage.from('derived');
    const { error } = await storage.upload(path, encoded.blob, {
      contentType: encoded.blob.type,
      upsert: true,
      cacheControl: '31536000',
    });
    if (error) return undefined;
    return storage.getPublicUrl(path).data.publicUrl;
  } catch {
    return undefined;
  }
}
