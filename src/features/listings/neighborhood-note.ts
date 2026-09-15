import type {
  NearbyCivic,
  NearbyPlace,
  NearbySchool,
  NearbyTransit,
  NeighborhoodNote,
} from '../../types/listing.js';

/**
 * Hebrew neighbourhood copy, from the lists already computed at publish.
 *
 * The model never sees coordinates, phones, or a plate. It sees names and
 * walking minutes. The page never calls the model — this file only builds the
 * prompt and refuses a reply that sounds like a valuation (CLAUDE.md §7).
 */

const HEBREW = /[\u0590-\u05FF]/;

/**
 * Words that turn a description into an appraisal.
 *
 * Matched as substrings because Hebrew prefixes attach: בשווי, להשקעה.
 * A hit means the whole note is dropped, not edited — rewriting a banned
 * sentence is how a valuation sneaks back in with different vowels.
 */
const VALUATION = /שווי|השקעה|תשואה|יעלה|אמיד|כדאי לקנות|שומה|משתלם|רווחי|הזדמנות|אפיין|יוקרתי/;

const MAX_CHARS = 720;

export interface NeighborhoodFacts {
  city?: string;
  transit: Pick<NearbyTransit, 'name' | 'walkMinutes' | 'mode'>[];
  schools: Pick<NearbySchool, 'name' | 'walkMinutes'>[];
  places: Pick<NearbyPlace, 'name' | 'walkMinutes' | 'category'>[];
  civic: Pick<NearbyCivic, 'name' | 'walkMinutes' | 'kind'>[];
}

function line(
  label: string,
  items: readonly { name: string; walkMinutes: number }[],
  cap = 3,
): string | undefined {
  if (items.length === 0) return undefined;
  const nearest = [...items]
    .sort((a, b) => a.walkMinutes - b.walkMinutes)
    .slice(0, cap)
    .map((item) => `${item.name} (${item.walkMinutes} דקות הליכה)`);
  return `${label}: ${nearest.join(', ')}`;
}

/**
 * The user message. City and already-routed facts only — never a lat/lng.
 */
export function buildNeighborhoodPrompt(facts: NeighborhoodFacts): string {
  const lines = [
    facts.city ? `עיר: ${facts.city}` : undefined,
    line('תחבורה', facts.transit),
    line('חינוך', facts.schools),
    line('מכולת ופארק', facts.places.filter((p) => p.category === 'grocery' || p.category === 'park')),
    line(
      'שירותים',
      facts.civic.map((item) => ({ name: `${item.kind} ${item.name}`, walkMinutes: item.walkMinutes })),
    ),
  ].filter((entry): entry is string => entry !== undefined);

  return lines.join('\n');
}

export const NEIGHBORHOOD_SYSTEM_PROMPT =
  'כתוב שתיים עד ארבע משפטים בעברית על סביבת הדירה, לפי רשימת העובדות בלבד. ' +
  'אסור להמציא מקומות או זמנים. אסור לכתוב על שווי, מחיר דירה, השקעה, תשואה, ' +
  'כדאיות קנייה או יוקרה. בלי כותרת, בלי נקודות, בלי שם של מודל.';

/**
 * Accepts a model reply, or undefined if it cannot go on a listing page.
 */
export function acceptNeighborhoodNote(raw: string): NeighborhoodNote | undefined {
  const text = raw
    .replace(/\*\*/g, '')
    .replace(/^["«»]+|["«»]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length < 24 || text.length > MAX_CHARS) return undefined;
  if (!HEBREW.test(text)) return undefined;
  if (VALUATION.test(text)) return undefined;
  if (/https?:\/\//i.test(text)) return undefined;
  if (/deepseek|openai|chatgpt/i.test(text)) return undefined;

  return { text };
}
