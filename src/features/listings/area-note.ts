import { findBannedWords, findReservedTopics } from './description.js';

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
 * ========================= NO GUESSED DISTANCES =========================
 * A number reaches this paragraph only as a routed walking time we were given.
 * Straight-line metres are forbidden as a substitute — in Israel a motorway or
 * a wadi turns 300 metres into a twenty-minute walk (CLAUDE.md §2).
 * `isGrounded` admits exactly the minutes in the list, and nothing else.
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
  schools: 3,
  parks: 2,
  community: 2,
  shops: 2,
} as const;

/** Closest first when a router answered; otherwise the OSM order (already nearest). */
function nearest(places: readonly AreaPlace[]): AreaPlace[] {
  return [...places].sort((a, b) => {
    const left = a.walkMinutes ?? Number.POSITIVE_INFINITY;
    const right = b.walkMinutes ?? Number.POSITIVE_INFINITY;
    return left - right;
  });
}

const busesOf = (places: AreaPlaces) =>
  places.transit.filter((place) => place.mode !== 'rail');

const railsOf = (places: AreaPlaces) =>
  places.transit.filter((place) => place.mode === 'rail');

/**
 * One line of the prompt, with routed minutes where we have them.
 *
 * "שם (7 דקות הליכה)" is the only shape in which a number reaches the model,
 * and `isGrounded` allows exactly the numbers that appear here. A place with
 * no routed time is named without one rather than guessed at.
 */
function named(place: AreaPlace): string {
  return place.walkMinutes === undefined
    ? place.name
    : `${place.name} (${place.walkMinutes} דקות הליכה)`;
}

function line(label: string, places: readonly AreaPlace[], cap: number): string | undefined {
  const kept = nearest(places).slice(0, cap).map(named);
  return kept.length > 0 ? `${label}: ${kept.join(', ')}` : undefined;
}

function closestLine(label: string, places: readonly AreaPlace[]): string | undefined {
  const place = nearest(places)[0];
  return place ? `${label}: ${named(place)}` : undefined;
}

/** The user message. Names only — there is no coordinate and no distance. */
export function buildAreaPrompt(places: AreaPlaces, previous?: string): string {
  return [
    `עיר: ${places.city}`,
    places.street ? `רחוב: ${places.street}` : undefined,
    line('שכונה', places.neighbourhoods, CAPS.neighbourhoods),
    line('קהילה ותרבות', places.community, CAPS.community),
    line('פארקים וגינות', places.parks, CAPS.parks),
    closestLine('תחנת האוטובוס הקרובה — רק זו', busesOf(places)),
    closestLine('תחנת הרכבת או הרכבת הקלה הקרובה — רק זו', railsOf(places)),
    line('חינוך — בשם המוסד, שניים או שלושה', places.schools, CAPS.schools),
    line('מסחר יומיומי', places.shops, CAPS.shops),
    'כתוב מודעה של מתווך בארבעה חלקים: המקום, הירוק מסביב, הלימוד, ההגעה, ואם יש גם קניות מהרשימה.',
    'רק שמות מהרשימה. דקות הליכה רק בצורה שנמסרה. בלי מספר תושבים ובלי דרך שלא נמסרה.',
    previous?.trim()
      ? `כתוב ניסוח אחר לגמרי. אסור לחזור על הפסקה הזו מילה במילה:\n${previous.trim()}`
      : undefined,
  ]
    .filter((entry): entry is string => entry !== undefined)
    .join('\n');
}

/**
 * The instruction, and every clause in it is load-bearing.
 *
 * The seller asked for professional agency copy: a little about the
 * neighbourhood and community, a little about how you get around (the closest
 * bus, and a train if there is one), a little about the schools. A comma list
 * of every OSM name is the thing they already have and do not want.
 */
export const AREA_SYSTEM_PROMPT =
  'אתה כותב תיאור שכונה בעברית כמו מתווך מורשה במודעת נדל״ן. ' +
  'ארבע עד שש משפטים רהוטים, אפשר שני פסקאות קצרות, בלי כותרות ובלי נקודות. ' +
  'קודם השכונה והעיר — איך המקום מרגיש, לפי השמות שניתנו בלבד. ' +
  'אחר כך סביבה וטבע: פארק או גינה מהרשימה. ' +
  'אחר כך חינוך: שני מוסדות בשם. ' +
  'אחר כך תחבורה: תחנת האוטובוס הקרובה, ורכבת אם יש ברשימה. ' +
  'לבסוף מסחר יומיומי אם יש ברשימה. ' +
  'מותר להזכיר רק שמות שמופיעים ברשימה. אסור שם שלא ברשימה. ' +
  'זמני הליכה מותרים רק במספרים שמופיעים ליד השם, בצורה "N דקות הליכה". אסור להמציא דקות, קו אוטובוס, כביש או מספר תושבים. ' +
  'אסור מחיר, שווי, השקעה, תשואה או פוטנציאל. ' +
  'אסור מילות הפלגה כמו מדהים, ייחודי, חלומי, יוקרתי. ' +
  'אסור לכתוב מה אין בסביבה. ' +
  'עברית רהוטה. בלי אמוג׳י, בלי שם של מודל, בלי אנגלית.';

const HEBREW = /[\u0590-\u05FF]/;

/** A broker paragraph, not a page and not a caption. */
const MIN_CHARS = 40;
const MAX_CHARS = 900;

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
  const text = raw
    .replace(/\*\*/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/^["«»]+|["«»]+$/g, '')
    .trim();

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
 * The same paragraph with no model involved: neighbourhood, the closest stop,
 * the schools — in sentences a broker would send.
 *
 * Used when there is no key, when the provider is down, and when a reply fails
 * grounding. Plainer than the model's version and never a comma dump of OSM.
 */
export function areaNoteFromPlaces(
  places: AreaPlaces,
  options: { alternate?: boolean } = {},
): string {
  const hood = places.neighbourhoods[0]?.name;
  const street = places.street;
  const where = hood
    ? street
      ? `הדירה בשכונת ${hood} ב${places.city}, ברחוב ${street}.`
      : `הדירה בשכונת ${hood} ב${places.city}.`
    : street
      ? `הדירה ב${places.city}, ברחוב ${street}.`
      : `הדירה ב${places.city}.`;

  const sentences = [where];

  const park = places.parks[0];
  const community = places.community[0];
  if (hood && (park || community)) {
    if (park && community) {
      sentences.push(`השכונה חיה סביב ${named(park)} ו${named(community)}.`);
    } else {
      sentences.push(`השכונה חיה סביב ${named(park ?? community!)}.`);
    }
  } else if (park && community) {
    sentences.push(`בסביבה ${named(park)} ו${named(community)}.`);
  } else if (park || community) {
    sentences.push(`בסביבה ${named(park ?? community!)}.`);
  }

  const bus = nearest(busesOf(places))[0];
  const rail = nearest(railsOf(places))[0];
  if (bus && rail) {
    sentences.push(
      `תחנת האוטובוס הקרובה היא ${named(bus)}, ותחנת הרכבת הקרובה היא ${named(rail)}.`,
    );
  } else if (rail) {
    sentences.push(`תחנת הרכבת הקרובה היא ${named(rail)}.`);
  } else if (bus) {
    sentences.push(`תחנת האוטובוס הקרובה היא ${named(bus)}.`);
  }

  const schools = nearest(places.schools).slice(0, 3).map(named);
  if (schools.length > 0) {
    sentences.push(`בתי הספר בסביבה כוללים את ${hebrewList(schools)}.`);
  }

  const shops = nearest(places.shops).slice(0, 2).map(named);
  if (shops.length > 0) {
    sentences.push(`למסחר יומיומי יש את ${hebrewList(shops)}.`);
  }

  if (options.alternate && sentences.length > 2) {
    const [whereLine, ...rest] = sentences;
    return [whereLine, ...rest.reverse()].join(' ');
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
