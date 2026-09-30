import type { Listing, TemplateId } from '../../types/listing.js';

/**
 * The WhatsApp card, designed per template (plan §6: "a matching OG card").
 *
 * The card is a PAGE — /a/{slug}/card, 1200 × 630 — that the worker's
 * render_card job screenshots in Chrome, for the reason the story and the
 * flyer are pages: Hebrew, <bdi> numbers and the template's own faces render
 * exactly as they do on the listing, with no second typesetting to drift.
 *
 * Until a card exists, and whenever the one stored is for content the
 * listing no longer has, the page advertises the photo crop (generate_og) or
 * the cover. A card is only ever used when its key matches — see
 * shareCardKey.
 */

/**
 * The card's look. Twelve templates, seven layouts: a card is 1200 × 630 and
 * read at thumbnail size, so what carries over is each template's signature
 * (a dark full-bleed photograph, a blueprint ground, numerals as type, riso
 * inks, a case file, a ticket stub), not its every section.
 */
export type CardFamily = 'night' | 'paper' | 'blueprint' | 'poster' | 'zine' | 'dossier' | 'ticket';

const FAMILIES: Record<TemplateId, CardFamily> = {
  // 1.x templates have no Living Surfaces mode; they get the plain paper card.
  agency: 'paper',
  editorial: 'paper',
  dark: 'night',
  walkFirst: 'paper',
  brochure: 'paper',
  linen: 'paper',
  studio: 'paper',
  gallery: 'paper',
  showcase: 'paper',
  aurora: 'night',
  blueprint: 'blueprint',
  monolith: 'night',
  atelier: 'paper',
  glass: 'night',
  showroom: 'night',
  heliograph: 'paper',
  walk: 'paper',
  poster: 'poster',
  zine: 'zine',
  dossier: 'dossier',
  ticket: 'ticket',
};

export function cardFamily(template: TemplateId): CardFamily {
  return FAMILIES[template];
}

/**
 * What the card shows, reduced to one short string.
 *
 * The card page prints it into <meta name="card-key">; the worker reads it
 * back and stores it beside the image; the listing page recomputes it and
 * uses the card only when the two agree. So a seller who drops the price
 * never has the old figure advertised in a WhatsApp thread while the new card
 * is being made (CLAUDE.md §6: previews are cached hard) — the page falls
 * back to the photo until the card for the new content exists.
 *
 * Over-inclusive on purpose: a field here that the card does not happen to
 * print costs one fallback between an edit and the next render. A field the
 * card prints that is missing here would advertise stale content.
 *
 * FNV-1a, 32 bits: this detects change, it is not a secret and not a
 * signature. Synchronous, so the page computes it without awaiting.
 */
export function shareCardKey(listing: Listing): string {
  const parts = [
    listing.template,
    listing.accent ?? '',
    listing.category,
    listing.title,
    listing.price,
    listing.priceDisplay ?? '',
    listing.audience ?? '',
    listing.media.cover.url,
    listing.location ?? null,
    listing.facts.map((fact) => [fact.key, fact.value, fact.present]),
    listing.seller.name,
    listing.seller.agencyName ?? '',
    listing.seller.role ?? '',
    listing.seller.licenceNumber ?? '',
  ];
  return fnv1a(JSON.stringify(parts));
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface ShareCard {
  url: string;
  key: string;
}

/** The stored `media.card`, or undefined for anything malformed. */
export function cardFor(value: unknown): ShareCard | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.url !== 'string' || typeof record.key !== 'string') return undefined;
  if (!record.url.startsWith('https://')) return undefined;
  if (!/^[0-9a-f]{8}$/.test(record.key)) return undefined;
  return { url: record.url, key: record.key };
}

/** The card, if it was made for exactly what this listing shows now. */
export function currentCard(listing: Listing): string | undefined {
  const card = listing.media.card;
  return card && card.key === shareCardKey(listing) ? card.url : undefined;
}
