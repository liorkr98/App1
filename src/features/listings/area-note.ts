import {
  findBannedWords,
  findReservedTopics,
  tidyParagraph,
} from './description.js';

/**
 * The area paragraph: what is around this address, by name.
 *
 * WHAT AN AGENT ASKED FOR. "Write the description by the address — about the
 * neighbourhood, schools, transport, community. A few lines, not more." That
 * is the most useful sentence on a listing page and the one a seller is least
 * able to write quickly, so it is worth doing properly.
 *
 * ====================== WHERE THE FACTS COME FROM ======================
 * OpenStreetMap, queried for the street inside the city and everything named
 * within 600 metres of it (web/src/lib/overpass.ts). Real schools, real bus
 * stops, real parks, the real neighbourhood name. Nothing here is the model's
 * own knowledge of the city, and that distinction is the whole design: a
 * paragraph about a school that does not exist is the seller's professional
 * reputation, not ours (CLAUDE.md §7).
 *
 * ODbL is a condition, not a courtesy — any page carrying copy derived from
 * these names carries the attribution (CLAUDE.md §10).
 * =======================================================================
 *
 * ========================= NO DISTANCES, NO TIMES =========================
 * Not one number reaches this paragraph. OSRM is not running, so we have no
 * routed walking time, and straight-line distance is forbidden as a substitute
 * — in Israel a motorway or a wadi turns 300 metres into a twenty-minute walk
 * (CLAUDE.md §2). "Around 600 metres" would be a distance the reader converts
 * into a walk themselves, which is the same lie with an extra step.
 *
 * So the copy names things and does not measure them, and `isGrounded` rejects
 * any reply containing a digit at all. When OSRM is up, the richer paragraph
 * with routed minutes already exists in neighborhood-note.ts and should take
 * over — this module is the version that works today.
 * =========================================================================
 */

import type { AreaPlace, AreaPlaces } from '../../types/listing.js';

export type { AreaPlace, AreaPlaces };

/** Every group as one list, in the order the paragraph introduces them. */
export function allPlaces(places: AreaPlaces): AreaPlace[] {
  return [
    ...places.neighbourhoods,
    ...places.schools,
    ...places.transit,
    ...places.parks,
    ...places.community,
    ...places.shops,
  ];
}

const names = (places: readonly AreaPlace[]): string[] => places.map((place) => place.name);

/** Empty means there is nothing to write about and we do not pretend. */
export function hasPlaces(places: AreaPlaces): boolean {
  return (
    places.neighbourhoods.length +
      places.schools.length +
      places.transit.length +
      places.parks.length +
      places.community.length +
      places.shops.length >
    0
  );
}

/** Every name the paragraph is allowed to use. */
export function allowedNames(places: AreaPlaces): string[] {
  return [
    places.city,
    ...(places.street ? [places.street] : []),
    ...names(allPlaces(places)),
  ];
}

/**
 * How many of each go in the prompt.
 *
 * A street can sit near forty bus stops, and a model handed forty names
 * writes a list. Four lines about six things reads like an agent wrote it;
 * the same lines about thirty reads like a database dump.
 */
const CAPS = {
  neighbourhoods: 2,
  schools: 4,
  transit: 3,
  parks: 3,
  community: 3,
  shops: 2,
} as const;

/**
 * One line of the prompt, with routed minutes where we have them.
 *
 * "שם (7 דקות הליכה)" is the only shape in which a number reaches the model,
 * and `isGrounded` allows exactly the numbers that appear here. A place with
 * no routed time is named without one rather than guessed at.
 */
function line(label: string, places: readonly AreaPlace[], cap: number): string | undefined {
  const kept = places.slice(0, cap).map((place) =>
    place.walkMinutes === undefined
      ? place.name
      : `${place.name} (${place.walkMinutes} דקות הליכה)`,
  );
  return kept.length > 0 ? `${label}: ${kept.join(', ')}` : undefined;
}

/** The user message. Names only — there is no coordinate and no distance. */
export function buildAreaPrompt(places: AreaPlaces): string {
  return [
    `עיר: ${places.city}`,
    places.street ? `רחוב: ${places.street}` : undefined,
    line('שכונה', places.neighbourhoods, CAPS.neighbourhoods),
    line('חינוך — בשם המוסד', places.schools, CAPS.schools),
    line('תחבורה — בשם התחנה', places.transit, CAPS.transit),
    line('פארקים וגינות', places.parks, CAPS.parks),
    line('קהילה, תרבות וספורט', places.community, CAPS.community),
    line('קניות', places.shops, CAPS.shops),
  ]
    .filter((entry): entry is string => entry !== undefined)
    .join('\n');
}

/**
 * The instruction, and every clause in it is load-bearing.
 *
 * "A few lines, not more" is the agent's own requirement and it is also the
 * product's: this paragraph is read on a phone, in sunlight, by somebody
 * deciding whether to reply. Length is not thoroughness here.
 */
export const AREA_SYSTEM_PROMPT =
  'אתה כותב פסקה קצרה בעברית על הסביבה של דירה למכירה. ' +
  'שניים עד ארבעה משפטים קצרים, ולא יותר. ' +
  'מותר להזכיר רק שמות שמופיעים ברשימה שנמסרה לך — בתי ספר, גנים, תחנות, פארקים, מוסדות קהילה, חנויות. ' +
  'אסור להוסיף שם של מקום שלא ברשימה. ' +
  'אסור לכתוב מרחקים, זמני הליכה, דקות, מספרים או קווי אוטובוס. ' +
  'אסור לכתוב על מחיר, שווי, השקעה, תשואה או פוטנציאל. ' +
  'אסור מילות הפלגה כמו מדהים, ייחודי, חלומי, יוקרתי. ' +
  'אסור לכתוב מה אין בסביבה. ' +
  'כתוב בעברית פשוטה, כמו מתווך שמתאר שכונה שהוא מכיר. ' +
  'בלי כותרת, בלי רשימת נקודות, בלי אמוג׳י, בלי שם של מודל.';

const HEBREW = /[\u0590-\u05FF]/;

/** Two sentences of Hebrew, and not a page. "A few lines, not more." */
const MIN_CHARS = 40;
const MAX_CHARS = 420;

/**
 * Cities a model reaches for when it is filling space rather than reading the
 * list. A paragraph about a flat in Holon that mentions Tel Aviv is describing
 * somewhere else, and it is the most plausible-sounding way this can go wrong.
 */
const OTHER_CITIES = [
  'תל אביב',
  'ירושלים',
  'חיפה',
  'באר שבע',
  'ראשון לציון',
  'פתח תקווה',
  'נתניה',
  'אשדוד',
  'רמת גן',
  'הרצליה',
  'רעננה',
  'כפר סבא',
  'חולון',
  'בת ים',
  'רחובות',
  'אשקלון',
  'מודיעין',
  'רמלה',
  'לוד',
  'עפולה',
  'נצרת',
  'אילת',
];

/**
 * Whether the paragraph says only what the list supports.
 *
 * The checks are about CLAIMS, not vocabulary: mentioning schools is fine, and
 * mentioning schools without naming one of the real ones is not.
 */
export function isGrounded(text: string, places: AreaPlaces): boolean {
  /*
   * THE ONLY NUMBERS ALLOWED ARE ROUTED WALKING MINUTES WE WERE GIVEN.
   *
   * With no router configured that set is empty, and the rule reduces to "no
   * digits at all" — which is correct, because then there is nothing numeric
   * about the area we could source. With a router it admits exactly the
   * minutes in the prompt, so "7 דקות" is allowed when the router said seven
   * and refused when it said nothing or said nine.
   */
  const allowed = new Set(
    allPlaces(places)
      .map((place) => place.walkMinutes)
      .filter((minutes): minutes is number => minutes !== undefined)
      .map(String),
  );
  for (const number of text.match(/\d+/g) ?? []) {
    if (!allowed.has(number)) return false;
  }

  const mentions = (needle: RegExp, group: readonly AreaPlace[]) =>
    !needle.test(text) || group.some((place) => text.includes(place.name));

  if (!mentions(/בית ספר|בתי ספר|בי״ס|גן ילדים|גני ילדים|תיכון|חטיבה/, places.schools)) {
    return false;
  }
  if (!mentions(/תחנ|אוטובוס|רכבת|רכבת קלה|מטרו/, places.transit)) return false;
  if (!mentions(/פארק|גינה|גינות/, places.parks)) return false;
  if (!mentions(/מתנ״ס|מתנ''ס|ספרי|מועדון|בריכה|מרכז קהילתי/, places.community)) {
    return false;
  }
  if (!mentions(/סופרמרקט|מכולת|מאפי|בית מרקחת|סופר/, places.shops)) return false;

  // Somewhere else entirely.
  const elsewhere = OTHER_CITIES.filter(
    (city) => city !== places.city && text.includes(city),
  );
  if (elsewhere.length > 0) return false;

  // A population claim: nothing in the list is a register of residents.
  if (/תושב|אוכלוס/.test(text)) return false;

  return true;
}

/**
 * Admits the model's paragraph, or returns undefined so the caller falls back.
 *
 * Failing is cheap and normal. The deterministic paragraph below is built from
 * the same names, so a rejected reply costs the seller plainer prose and
 * nothing else.
 */
export function acceptAreaNote(raw: string, places: AreaPlaces): string | undefined {
  const text = tidyParagraph(raw);

  if (text.length < MIN_CHARS || text.length > MAX_CHARS) return undefined;
  if (!HEBREW.test(text)) return undefined;
  if (/https?:\/\//i.test(text)) return undefined;
  if (/deepseek|openai|chatgpt|gpt/i.test(text)) return undefined;
  if (findBannedWords(text).length > 0) return undefined;
  if (findReservedTopics(text).length > 0) return undefined;
  if (!isGrounded(text, places)) return undefined;

  return text;
}

/** "א, ב ו־ג" — the last one joined with a vav, as Hebrew does. */
function hebrewList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ו${items[items.length - 1]}`;
}

/**
 * The same paragraph with no model involved: the names, in sentences.
 *
 * Used when there is no key, when the provider is down, and when a reply fails
 * grounding. It is plainer than the model's version and it is never wrong,
 * which is the right way round for a page an agent puts their name on.
 */
export function areaNoteFromPlaces(places: AreaPlaces): string {
  const where = places.neighbourhoods[0]
    ? `${places.neighbourhoods[0].name}, ${places.city}`
    : places.city;

  const sentences = [`הדירה ב${where}.`];

  /** "אורט חולון" or "אורט חולון, 7 דקות הליכה" — never a guessed time. */
  const said = (place: AreaPlace): string =>
    place.walkMinutes === undefined
      ? place.name
      : `${place.name} (${place.walkMinutes} דקות הליכה)`;

  const schools = places.schools.slice(0, 3).map(said);
  if (schools.length > 0) {
    sentences.push(`בסביבה ${hebrewList(schools)}.`);
  }

  const transit = places.transit.slice(0, 2).map(said);
  if (transit.length > 0) {
    sentences.push(`תחנות ${hebrewList(transit)}.`);
  }

  /*
   * ONE OF EACH, THREE AT MOST. Israeli place names run long — "מרכז קהילתי
   * על שם בני לוטי רייך לאזרחים ותיקים" is one item — and five of them in a
   * sentence is a list, not a description. The brief was a few lines.
   */
  const amenities = [places.parks[0], places.community[0], places.shops[0]]
    .filter((place): place is AreaPlace => Boolean(place))
    .map(said);
  if (amenities.length > 0) {
    sentences.push(`וגם ${hebrewList(amenities)}.`);
  }

  return sentences.join(' ');
}

/**
 * The credit, in Hebrew, for a page carrying copy built from these names.
 *
 * ODbL §4.3. It travels with the data rather than being hardcoded in a footer,
 * so a listing with no area copy carries no claim about a source it never
 * used (CLAUDE.md §10).
 */
export const OSM_ATTRIBUTION = 'מידע על הסביבה מ־OpenStreetMap, ברישיון ODbL';
