import type { Fact, Listing } from '@/types/listing';

import { factValue, ils, num } from './format';

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
  const head = year ? `${name}, ${num(Number(year.value))}` : name;
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
    const value = factValue(fact.value);
    parts.push(fact.unit ? `${value} ${fact.unit}` : `${fact.label} ${value}`.trim());
  }

  return parts.join(', ');
}

/**
 * OG image path. The hash goes in the FILENAME, never a query parameter.
 *
 * WhatsApp caches preview cards hard and some scrapers strip query strings
 * entirely, so `?v=2` does not bust anything — the seller edits their price
 * and the old card keeps being served for days. A new filename is a new
 * resource and cannot be cached as the old one.
 */
export function ogImagePath(slug: string, contentHash: string): string {
  return `/og/${slug}-${contentHash}.webp`;
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
    ? ogImagePath(listing.slug, listing.ogImageHash)
    : listing.media.cover.url;

  return new URL(path, site).href;
}
