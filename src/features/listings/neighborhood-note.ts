import type {
  NearbyCivic,
  NearbyPlace,
  NearbySchool,
  NearbyTransit,
  NeighborhoodNote,
  TransitMode,
} from '../../types/listing.js';

import { tidyParagraph } from './description.js';

/**
 * Hebrew neighbourhood copy, from the lists already computed at publish.
 *
 * This is the listing DESCRIPTION the seller can edit — not a live model call
 * on the page, not a valuation, and not a sentence about something we do not
 * have (CLAUDE.md §7). Coordinates never enter the prompt.
 */

const HEBREW = /[\u0590-\u05FF]/;

const VALUATION = /שווי|השקעה|תשואה|יעלה|אמיד|כדאי לקנות|שומה|משתלם|רווחי|הזדמנות|אפיין|יוקרתי/;

/** Only good things: a missing park is omitted, never "אין פארק". */
const NEGATIVE = /אין |חסר|רחוק מדי|בעיה|זיהום|רעש חזק|צפיפות יתר/;

const SUPERLATIVE = /חלומי|מדהים|מושלם|ייחודי|נדיר|מרהיב|פנטסטי/;

const MAX_CHARS = 720;

export interface NeighborhoodFacts {
  city?: string;
  transit: Pick<NearbyTransit, 'name' | 'walkMinutes' | 'mode'>[];
  schools: Pick<NearbySchool, 'name' | 'walkMinutes'>[];
  places: Pick<NearbyPlace, 'name' | 'walkMinutes' | 'category'>[];
  civic: Pick<NearbyCivic, 'name' | 'walkMinutes' | 'kind'>[];
  /**
   * Only when a public register actually supplied it. Never guessed.
   * Neighbourhood population is not in our ingest today, so this stays empty.
   */
  population?: { place: string; people: number };
}

const MODE_PHRASE: Record<TransitMode, string> = {
  light_rail: 'הרכבת הקלה',
  train: 'הרכבת',
  metro: 'המטרו',
  bus: 'אוטובוס',
};

function byWalk<T extends { walkMinutes: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.walkMinutes - b.walkMinutes);
}

function line(
  label: string,
  items: readonly { name: string; walkMinutes: number }[],
  cap = 3,
): string | undefined {
  if (items.length === 0) return undefined;
  const nearest = byWalk(items)
    .slice(0, cap)
    .map((item) => `${item.name} (${item.walkMinutes} דקות הליכה)`);
  return `${label}: ${nearest.join(', ')}`;
}

/**
 * The user message. City, named schools, routed minutes. Never a lat/lng,
 * never a population figure we do not have.
 */
export function buildNeighborhoodPrompt(facts: NeighborhoodFacts): string {
  const lines = [
    facts.city ? `עיר: ${facts.city}` : undefined,
    line(
      'תחבורה',
      facts.transit.map((stop) => ({
        name: `${MODE_PHRASE[stop.mode]} ${stop.name}`,
        walkMinutes: stop.walkMinutes,
      })),
    ),
    line('חינוך — בשם המוסד', facts.schools),
    line(
      'מכולת',
      facts.places.filter((place) => place.category === 'grocery'),
    ),
    line(
      'פארקים',
      facts.places.filter((place) => place.category === 'park'),
    ),
    line(
      'קהילה ותרבות',
      facts.places.filter((place) => place.category === 'culture' || place.category === 'gym'),
    ),
    line(
      'חניון ציבורי',
      facts.civic.filter((item) => item.kind === 'parking' || item.kind === 'park_ride'),
    ),
    facts.population
      ? `אוכלוסייה רשומה ב${facts.population.place}: ${facts.population.people} תושבים`
      : undefined,
  ].filter((entry): entry is string => entry !== undefined);

  return lines.join('\n');
}

export const NEIGHBORHOOD_SYSTEM_PROMPT =
  'כתוב פסקה אחת קצרה בעברית, שני עד ארבעה משפטים, שתהיה תיאור המודעה. ' +
  'רק דברים טובים שיש ברשימה: תחבורה בשם התחנה, בתי ספר וגנים בשמם, פארקים, ' +
  'מכולת, מתקני קהילה. אסור להמציא מקום, זמן, או מספר תושבים. ' +
  'אם אין אוכלוסייה ברשימה — לא כותבים על אוכלוסייה. ' +
  'אסור לכתוב מה חסר. אסור שווי, השקעה, תשואה, יוקרה או מילות הפלגה. ' +
  'בלי כותרת, בלי נקודות, בלי שם של מודל.';

function allowedNumbers(facts: NeighborhoodFacts): Set<string> {
  const out = new Set<string>();
  for (const item of [...facts.transit, ...facts.schools, ...facts.places, ...facts.civic]) {
    out.add(String(item.walkMinutes));
  }
  if (facts.population) out.add(String(facts.population.people));
  return out;
}

function mentionsUngrounded(
  text: string,
  needle: RegExp,
  names: readonly { name: string }[],
): boolean {
  if (!needle.test(text)) return false;
  if (names.length === 0) return true;
  return !names.some((item) => text.includes(item.name));
}

export function isGrounded(text: string, facts: NeighborhoodFacts): boolean {
  const allowed = allowedNumbers(facts);
  for (const number of text.match(/\d+/g) ?? []) {
    if (!allowed.has(number)) return false;
  }
  if (mentionsUngrounded(text, /רכבת|אוטובוס|מטרו/, facts.transit)) return false;
  if (mentionsUngrounded(text, /בית ספר|גן ילדים/, facts.schools)) return false;
  if (mentionsUngrounded(text, /פארק|גינה/, facts.places.filter((p) => p.category === 'park'))) {
    return false;
  }
  if (/תושב|אוכלוס/.test(text) && !facts.population) return false;
  return true;
}

/**
 * Deterministic fallback: the same facts, no model. Used when the key is
 * missing or the reply fails grounding. Only names that exist.
 */
export function groundedAreaDescription(facts: NeighborhoodFacts): string {
  const sentences: string[] = [];
  if (facts.city) sentences.push(`הדירה ב${facts.city}.`);

  const railFirst = [
    ...byWalk(facts.transit.filter((stop) => stop.mode !== 'bus')),
    ...byWalk(facts.transit.filter((stop) => stop.mode === 'bus')),
  ].slice(0, 2);
  if (railFirst.length > 0) {
    sentences.push(
      railFirst
        .map(
          (stop) =>
            `${MODE_PHRASE[stop.mode]} ${stop.name} כ־${stop.walkMinutes} דקות הליכה`,
        )
        .join(', ') + '.',
    );
  }

  const schools = byWalk(facts.schools).slice(0, 2);
  if (schools.length > 0) {
    sentences.push(
      'חינוך במרחק הליכה: ' +
        schools.map((school) => `${school.name} (${school.walkMinutes} דקות)`).join(', ') +
        '.',
    );
  }

  const grocery = byWalk(facts.places.filter((place) => place.category === 'grocery'))[0];
  const park = byWalk(facts.places.filter((place) => place.category === 'park'))[0];
  const community = byWalk(
    facts.places.filter((place) => place.category === 'culture' || place.category === 'gym'),
  )[0];
  const parking = byWalk(
    facts.civic.filter((item) => item.kind === 'parking' || item.kind === 'park_ride'),
  )[0];

  const amenities: string[] = [];
  if (grocery) amenities.push(`${grocery.name} (${grocery.walkMinutes} דקות)`);
  if (park) amenities.push(`${park.name} (${park.walkMinutes} דקות)`);
  if (community) amenities.push(`${community.name} (${community.walkMinutes} דקות)`);
  if (parking) amenities.push(`${parking.name} (${parking.walkMinutes} דקות)`);
  if (amenities.length > 0) {
    sentences.push(`בסביבה: ${amenities.join(', ')}.`);
  }

  if (facts.population) {
    sentences.push(`ב${facts.population.place} גרים ${facts.population.people} תושבים.`);
  }

  return sentences.join(' ').trim();
}

/**
 * Accepts a model reply or our own fallback, or undefined if it cannot go
 * on a listing as a description.
 */
/**
 * The DeepSeek / grounded paragraph is the listing description. A seller
 * who already wrote one keeps it; an empty field takes the area copy.
 */
export function descriptionOrArea(
  description: string,
  note?: NeighborhoodNote,
): string {
  if (description.trim() !== '') return description;
  return note?.text ?? description;
}

export function acceptNeighborhoodNote(
  raw: string,
  facts?: NeighborhoodFacts,
): NeighborhoodNote | undefined {
  const text = tidyParagraph(raw);

  if (text.length < 24 || text.length > MAX_CHARS) return undefined;
  if (!HEBREW.test(text)) return undefined;
  if (VALUATION.test(text) || NEGATIVE.test(text) || SUPERLATIVE.test(text)) return undefined;
  if (/https?:\/\//i.test(text)) return undefined;
  if (/deepseek|openai|chatgpt/i.test(text)) return undefined;
  if (facts && !isGrounded(text, facts)) return undefined;

  return { text };
}
