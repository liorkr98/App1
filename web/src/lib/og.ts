import type { Fact, Listing } from '@/types/listing';
import { factDefinition } from '@/features/listings/schemas';

import { factValue, ils, num } from './format';
import { supabaseUrl } from './supabase';

/**
 * Open Graph metadata.
 *
 * The page is distributed by WhatsApp link, so this card is the product's
 * first impression. If it is ugly nobody taps, and nothing else in the
 * codebase matters.
 */

function get(facts: Fact[], key: string): Fact | undefined {
  return facts.find((fact) => fact.key === key && fact.value !== null && fact.present !== false);
}

/**
 * og:title — "<summary> · <price>".
 *
 * The two categories summarise differently because the facts a buyer needs in
 * one line differ. This is content generation, not a template divergence.
 */
export function ogTitle(listing: Listing): string {
  const price = ils(listing.price);

  if (listing.category === 'property') {
    const rooms = get(listing.facts, 'rooms');
    const city = listing.location?.city;
    const head = rooms ? `דירת ${num(Number(rooms.value))} חדרים` : 'דירה';
    return city ? `${head} ב${city} · ${price}` : `${head} · ${price}`;
  }

  const make = get(listing.facts, 'make');
  const model = get(listing.facts, 'model');
  const year = get(listing.facts, 'year');
  const name = [make?.value, model?.value].filter(Boolean).join(' ');
  // Not num(): a year is an identifier, not a quantity, and grouping it
  // put "2,021" on the card that decides whether anyone taps at all (§6).
  const head = year ? `${name}, ${String(year.value)}` : name;
  return `${head} · ${price}`;
}

/**
 * og:description — one line of facts.
 *
 * No marketing language and no superlatives: the card competes in a WhatsApp
 * thread against messages from actual friends, and adjectives read as spam
 * there in a way they do not on a listing portal.
 */
export function ogDescription(listing: Listing, keys: string[]): string {
  const parts: string[] = [];

  for (const key of keys) {
    const fact = get(listing.facts, key);
    if (!fact) continue;

    /*
     * THE SCHEMA SAYS HOW A FACT IS SAID IN A SENTENCE, and this line is one.
     *
     * `${label} ${value}` produced "מעלית יש", "ממ״ד יש" and — because a unit
     * replaced the label entirely — "12 מ״ר" for a balcony, on the same line
     * as "95 מ״ר" for the flat. That is the single most-read string in the
     * product (§6): it is what a buyer sees in a WhatsApp thread beside
     * messages from actual people, and it read as machine output.
     *
     * `phrase` is the same field the generated description uses, so the card
     * and the prose say a fact the same way. A boolean's phrase is the thing
     * itself — "מעלית" — which is how anybody lists what a flat has.
     */
    const definition = factDefinition(listing.category, key);
    if (definition?.phrase) {
      if (fact.type === 'boolean') {
        if (fact.value === true) parts.push(definition.phrase.replace('{value}', '').trim());
        continue;
      }
      parts.push(
        definition.phrase.replace(
          '{value}',
          factValue(fact.value, definition.grouped !== false),
        ),
      );
      continue;
    }

    const value = factValue(fact.value);
    parts.push(fact.unit ? `${value} ${fact.unit}` : `${fact.label} ${value}`.trim());
  }

  return parts.join(', ');
}

/**
 * Where the generated card actually is.
 *
 * ============================ THE BUG THIS FIXES ============================
 * This returned `/og/{slug}-{hash}.webp` — a path on the site's own origin —
 * and NOTHING HAS EVER SERVED THAT PATH. The worker uploads the card to
 * Supabase Storage as `og/{listingId}-{hash}.webp` in the `derived` bucket
 * (worker/src/handlers/og.ts), which is a different bucket, a different host
 * and a different filename.
 *
 * So every listing whose card had been generated advertised an og:image that
 * 404s, and the fallback that exists for exactly this case never ran: the
 * fallback triggers on a MISSING hash, and the hash was present and correct.
 * Confirmed against the live site, not inferred — the worker's file answers
 * 200 at its storage URL and the advertised URL answers 404.
 *
 * That is the single most expensive failure available here. The page is
 * distributed by WhatsApp link; a card with no image is a link nobody taps,
 * and nothing downstream matters (CLAUDE.md §6).
 *
 * THE HASH IS STILL IN THE FILENAME, never a query parameter — WhatsApp
 * caches previews hard and some scrapers strip query strings, so `?v=2` busts
 * nothing while a new filename is a new resource. The change of URL shape also
 * invalidates the broken cards already scraped, which is a happy accident.
 *
 * worker/src/handlers/og.ts is the other half of this contract. If the upload
 * path there changes, this changes with it.
 * ===========================================================================
 */
export function ogImagePath(listingId: string, contentHash: string): string {
  return `${supabaseUrl}/storage/v1/object/public/derived/og/${listingId}-${contentHash}.webp`;
}

/**
 * The absolute og:image URL, with a fallback.
 *
 * WhatsApp rejects a relative og:image and shows a card with no picture, so
 * this is always absolute.
 *
 * When `ogImageHash` is absent the Stage D pipeline has not generated a
 * proper 1200x630 crop yet, and we point at the cover photo instead. That is
 * the wrong aspect ratio and WhatsApp will centre-crop it — but a
 * badly-cropped photo is enormously better than the empty grey card you get
 * from a 404, and the card is the one asset the whole product depends on.
 *
 * Uses the cover URL as uploaded, not a derived variant: the variants are
 * produced by the same pipeline that would have produced the OG image, so if
 * one is missing the others are too.
 */
export function ogImageUrl(listing: Listing, site: URL | undefined): string {
  const path = listing.ogImageHash
    ? ogImagePath(listing.id, listing.ogImageHash)
    : listing.media.cover.url;

  // Already absolute for both branches — the generated card lives on Storage
  // and an uploaded cover does too. `site` still resolves the demo fixtures,
  // whose covers are relative paths under /sample.
  return new URL(path, site).href;
}
