import type { Fact } from '../../types/listing.js';

import {
  busesOf,
  hasPlaces,
  mentionsGrounded,
  named,
  nearest,
  railsOf,
  routedMinutes,
  type AreaPlace,
  type AreaPlaces,
} from './area-note.js';
import {
  findBannedWords,
  findReservedTopics,
  findUnsupportedNumbers,
} from './description.js';
import type { CopyTone } from './listing-copy.js';
import { schemaFor, type ListingCategory } from './schemas/index.js';

/**
 * The property description in the shape an Israeli agent writes it (decided
 * 5 Oct 2026, replacing "the description is about the property only"):
 *
 *   1. an opening — what it is, how many rooms, which neighbourhood and city
 *   2. the apartment — size, floor of how many, condition, balcony, aspect
 *   3. the building — elevator; and parking, safe room, storage for the flat
 *   4. the neighbourhood — transport, everyday shopping, schools, leisure and
 *      culture, each by name, with routed walking minutes where we have them
 *   5. a closing line — entry date or lease, and an invitation to visit
 *
 * Paragraphs are separated by a blank line; the listing page renders each as
 * its own <p> (ListingPage.astro splits on "\n\n").
 *
 * THE SAME RULES AS BEFORE, APPLIED TO MORE TEXT (CLAUDE.md §7, §2):
 * - every noun comes from a fact the seller answered or a place OSM named;
 * - a walking time appears only as a routed minute we were given — never a
 *   straight-line guess — and a place without one is named without one;
 * - nothing absent is advertised as absent, nothing is valued, nothing is
 *   "dream" or "unique".
 *
 * THREE VARIANTS. "הצע תיאור אחר" must give a different text even when no
 * model is available, so each part has three phrasings and the parts come in
 * a different order. The caller picks the first variant that differs from
 * what is in the box.
 */

export const AGENT_VARIANTS = 3;

export interface AgentCopyInput {
  category: ListingCategory;
  facts: readonly Fact[];
  city?: string;
  /** The seller's own words, when they wrote some. Never invented for them. */
  sellerNotes?: string;
  /** The surroundings, when the address was looked up (api/area.ts). */
  places?: AreaPlaces;
  /**
   * The voice the agent chose (מקצועי / חם / מוקפד). It changes the opening,
   * the neighbourhood's wording and the closing — never which facts are said.
   * Before, only the model heard it, so without a model all three chips gave
   * the same text.
   */
  tone?: CopyTone;
}

/** Answered, and not a confirmed absence. Absence belongs to the grid (§7). */
function answered(facts: readonly Fact[], key: string): Fact | undefined {
  return facts.find(
    (fact) => fact.key === key && fact.present !== false && fact.value !== null && fact.value !== '',
  );
}

function numberOf(facts: readonly Fact[], key: string): number | undefined {
  const value = answered(facts, key)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function textOf(facts: readonly Fact[], key: string): string | undefined {
  const value = answered(facts, key)?.value;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function has(facts: readonly Fact[], key: string): boolean {
  return answered(facts, key)?.value === true;
}

const grouped = (value: number) => value.toLocaleString('he-IL');

/** "א, ב ו־ג" — the last item joined with a vav, as Hebrew does. */
function hebrewList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  const last = items[items.length - 1] ?? '';
  // Before a Latin name or a digit the vav takes a maqaf: "ו־AM:PM".
  const vav = /^[\u05D0-\u05EA]/.test(last) ? 'ו' : 'ו\u05BE';
  return `${items.slice(0, -1).join(', ')} ${vav}${last}`;
}

const sentence = (text: string) => (/[.!?:]$/.test(text) ? text : `${text}.`);

// ------------------------------------------------------------------ 1. opening

function homePhrase(facts: readonly Fact[]): string {
  const rooms = numberOf(facts, 'rooms');
  if (rooms === undefined) return 'דירה';
  if (rooms === 1) return 'דירת חדר';
  return `דירת ${grouped(rooms)} חדרים`;
}

function opening(input: AgentCopyInput, variant: number): string {
  const home = homePhrase(input.facts);
  const hood = input.places ? nearest(input.places.neighbourhoods)[0]?.name : undefined;
  const city = input.city;
  const where = [hood ? `בשכונת ${hood}` : undefined, city ? `ב${city}` : undefined]
    .filter(Boolean)
    .join(' ');

  if (input.tone === 'warm') {
    if (variant === 1) return where ? `${where} מחכה לכם ${home}.` : `מחכה לכם ${home}.`;
    if (variant === 2) return where ? `${home} ${where} — בואו לראות אותה מקרוב.` : `${home} — בואו לראות אותה מקרוב.`;
    return where ? `בואו להכיר ${home} ${where}.` : `בואו להכיר ${home}.`;
  }
  if (input.tone === 'refined') {
    const place = [hood ? `שכונת ${hood}` : undefined, city].filter(Boolean).join(', ');
    if (variant === 1) return place ? `${place}. ${home}.` : `${home}.`;
    if (variant === 2) return place ? `${home}, ${place}.` : `${home}.`;
    return place ? `${home}. ${place}.` : `${home}.`;
  }

  if (variant === 1) {
    if (city && hood) return `למכירה ב${city}, בשכונת ${hood}: ${home}.`;
    if (city) return `למכירה ב${city}: ${home}.`;
    return `למכירה: ${home}.`;
  }
  if (variant === 2) {
    if (city && hood) return `בשכונת ${hood} שב${city} מוצעת למכירה ${home}.`;
    if (city) return `ב${city} מוצעת למכירה ${home}.`;
    return `מוצעת למכירה ${home}.`;
  }
  if (city && hood) return `${home} בשכונת ${hood} ב${city}.`;
  if (city) return `${home} ב${city}.`;
  return `${home}.`;
}

// ---------------------------------------------------------------- 2. apartment

function floorPhrase(facts: readonly Fact[]): string | undefined {
  const floor = numberOf(facts, 'floor');
  if (floor === undefined) return undefined;
  const total = numberOf(facts, 'total_floors');
  if (floor === 0) return total !== undefined ? `בקומת הקרקע מתוך ${grouped(total)}` : 'בקומת הקרקע';
  return total !== undefined ? `בקומה ${grouped(floor)} מתוך ${grouped(total)}` : `בקומה ${grouped(floor)}`;
}

function apartment(input: AgentCopyInput, variant: number): string | undefined {
  const { facts } = input;
  const size = numberOf(facts, 'area_sqm');
  const floor = floorPhrase(facts);
  const condition = textOf(facts, 'condition');
  const balcony = numberOf(facts, 'balcony_sqm');
  const aspect = textOf(facts, 'aspect');

  const extras = [
    balcony !== undefined ? `מרפסת שמש של ${grouped(balcony)} מ״ר` : undefined,
    aspect ? `כיווני אוויר ${aspect}` : undefined,
  ].filter((part): part is string => part !== undefined);

  const sentences: string[] = [];

  if (variant === 1) {
    const where = [size !== undefined ? `${grouped(size)} מ״ר` : undefined, floor].filter(Boolean).join(', ');
    if (where) sentences.push(`מדובר בדירה של ${where}.`);
    if (extras.length > 0) sentences.push(sentence(`יש בה ${hebrewList(extras)}`));
    if (condition) sentences.push(`הנכס ${condition}.`);
  } else if (variant === 2) {
    if (condition) sentences.push(`הנכס ${condition}.`);
    const where = [size !== undefined ? `שטח של ${grouped(size)} מ״ר` : undefined, floor].filter(Boolean).join(', ');
    if (where) sentences.push(sentence(`לדירה ${where}`));
    if (extras.length > 0) sentences.push(sentence(`בנוסף, ${hebrewList(extras)}`));
  } else {
    if (size !== undefined && floor) sentences.push(`שטח הדירה ${grouped(size)} מ״ר, והיא ממוקמת ${floor}.`);
    else if (size !== undefined) sentences.push(`שטח הדירה ${grouped(size)} מ״ר.`);
    else if (floor) sentences.push(`הדירה ממוקמת ${floor}.`);
    if (condition && extras.length > 0) sentences.push(`הנכס ${condition}, עם ${hebrewList(extras)}.`);
    else if (condition) sentences.push(`הנכס ${condition}.`);
    else if (extras.length > 0) sentences.push(sentence(`לדירה ${hebrewList(extras)}`));
  }

  const notes = input.sellerNotes?.trim();
  if (notes) sentences.push(sentence(notes));

  return sentences.length > 0 ? sentences.join(' ') : undefined;
}

// ----------------------------------------------------------------- 3. building

function building(input: AgentCopyInput, variant: number): string | undefined {
  const { facts } = input;
  const elevator = has(facts, 'elevator');
  const own = [
    has(facts, 'parking') ? 'חניה' : undefined,
    has(facts, 'shelter') ? 'ממ״ד' : undefined,
    has(facts, 'storage') ? 'מחסן' : undefined,
  ].filter((part): part is string => part !== undefined);

  if (!elevator && own.length === 0) return undefined;

  if (variant === 1) {
    if (own.length > 0 && elevator) return `הדירה כוללת ${hebrewList(own)}, ובבניין יש מעלית.`;
    if (own.length > 0) return `הדירה כוללת ${hebrewList(own)}.`;
    return 'בבניין יש מעלית.';
  }
  if (variant === 2) {
    return `במפרט: ${hebrewList([...(elevator ? ['מעלית'] : []), ...own])}.`;
  }
  if (elevator && own.length > 0) return `בבניין מעלית, ולדירה יש ${hebrewList(own)}.`;
  if (elevator) return 'בבניין מעלית.';
  return `לדירה יש ${hebrewList(own)}.`;
}

// ------------------------------------------------------------- 4. neighbourhood

interface Around {
  transit: AreaPlace[];
  shops: AreaPlace[];
  schools: AreaPlace[];
  leisure: AreaPlace[];
}

function around(places: AreaPlaces): Around {
  const rail = nearest(railsOf(places))[0];
  const bus = nearest(busesOf(places))[0];
  return {
    transit: [rail, bus].filter((place): place is AreaPlace => place !== undefined),
    shops: nearest(places.shops).slice(0, 2),
    schools: nearest(places.schools).slice(0, 3),
    leisure: [nearest(places.parks)[0], nearest(places.community)[0]].filter(
      (place): place is AreaPlace => place !== undefined,
    ),
  };
}

/** OSM often names a station "תחנת …" already; it is not said twice. */
function transitPhrase(rail: boolean, place: AreaPlace, label: (place: AreaPlace) => string): string {
  if (/^תחנ/.test(place.name)) return label(place);
  return rail ? `תחנת ${label(place)}` : `תחנת האוטובוס ${label(place)}`;
}

function transitLine(places: AreaPlaces, label: (place: AreaPlace) => string): string | undefined {
  const rail = nearest(railsOf(places))[0];
  const bus = nearest(busesOf(places))[0];
  const parts = [
    rail ? transitPhrase(true, rail, label) : undefined,
    bus ? transitPhrase(false, bus, label) : undefined,
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? hebrewList(parts) : undefined;
}

/**
 * "שם (7 דקות הליכה)" the first time in the paragraph, "שם (7 דק׳)" after.
 * Eight full phrases in a row read as a table, which is not how an agent
 * writes; the number is the same either way, so the grounding is too.
 */
function timer(): (place: AreaPlace) => string {
  let first = true;
  return (place) => {
    if (place.walkMinutes === undefined) return place.name;
    if (first) {
      first = false;
      return named(place);
    }
    const m = place.walkMinutes;
    const short = m === 1 ? 'דקה' : m === 2 ? 'שתי דק׳' : `${m} דק׳`;
    return `${place.name} (${short})`;
  };
}

function neighbourhood(input: AgentCopyInput, variant: number): string | undefined {
  const places = input.places;
  if (!places || !hasPlaces(places)) return undefined;
  const near = around(places);
  const label = timer();
  const listOf = (group: readonly AreaPlace[]) =>
    group.length > 0 ? hebrewList(group.map(label)) : undefined;

  // The variants mention the groups in different orders, and the full
  // "דקות הליכה" belongs to whichever comes first — so each list is built
  // in the order it is said.
  const transit = () => transitLine(places, label);
  const shops = () => listOf(near.shops);
  const schools = () => listOf(near.schools);
  const leisure = () => listOf(near.leisure);

  const lines: string[] = [];
  const say = (text: string | undefined, line: (text: string) => string) => {
    if (text) lines.push(line(text));
  };

  // Warm and refined keep one wording each and let the variant reorder it.
  const toned: Record<'warm' | 'refined', { intro: string; parts: [() => string | undefined, (text: string) => string][] }> = {
    warm: {
      intro: '',
      parts: [
        [transit, (text) => `ברגל מהבית: ${text}.`],
        [shops, (text) => `לקניות של כל יום — ${text}.`],
        [schools, (text) => `לילדים, בקרבת מקום: ${text}.`],
        [leisure, (text) => `ולשעות הפנויות — ${text}.`],
      ],
    },
    refined: {
      intro: '',
      parts: [
        [transit, (text) => `תחבורה — ${text}.`],
        [shops, (text) => `מסחר — ${text}.`],
        [schools, (text) => `חינוך — ${text}.`],
        [leisure, (text) => `פנאי — ${text}.`],
      ],
    },
  };
  if (input.tone === 'warm' || input.tone === 'refined') {
    const { intro, parts } = toned[input.tone];
    const order = [parts, [parts[2]!, parts[3]!, parts[1]!, parts[0]!], [parts[1]!, parts[0]!, parts[3]!, parts[2]!]][variant] ?? parts;
    for (const [text, line] of order) say(text(), line);
    if (lines.length === 0) return undefined;
    return [intro, ...lines].filter((part) => part !== '').join(' ');
  }

  if (variant === 1) {
    say(transit(), (text) => `במרחק הליכה נמצאות ${text}.`);
    say(shops(), (text) => `לקניות היומיומיות יש את ${text}.`);
    say(schools(), (text) => `בתי הספר והגנים הקרובים: ${text}.`);
    say(leisure(), (text) => `ולשעות הפנאי — ${text}.`);
  } else if (variant === 2) {
    say(schools(), (text) => `משפחות ימצאו בקרבת מקום את ${text}.`);
    say(leisure(), (text) => `לפנאי ולתרבות: ${text}.`);
    say(shops(), (text) => `קניות יומיומיות: ${text}.`);
    say(transit(), (text) => `ובתחבורה הציבורית: ${text}.`);
  } else {
    say(transit(), (text) => `תחבורה ציבורית: ${text}.`);
    say(shops(), (text) => `קניות יומיומיות: ${text}.`);
    say(schools(), (text) => `חינוך: ${text}.`);
    say(leisure(), (text) => `פנאי ותרבות: ${text}.`);
  }
  if (lines.length === 0) return undefined;

  // Variant 0 is already a list of "label: names", so it takes no intro.
  const intro = ['', 'על השכונה:', 'מה יש בסביבה?'][variant] ?? '';
  return [intro, ...lines].filter((part) => part !== '').join(' ');
}

// ------------------------------------------------------------------ 5. closing

function entryPhrase(facts: readonly Fact[]): string | undefined {
  const entry = textOf(facts, 'entry_date');
  if (!entry) return undefined;
  if (entry === 'מיידי') return 'כניסה מיידית.';
  if (entry === 'גמיש') return 'מועד הכניסה גמיש.';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(entry);
  if (iso) return `כניסה ב־${iso[3]}/${iso[2]}/${iso[1]}.`;
  return `כניסה: ${entry}.`;
}

const CLOSINGS: Record<CopyTone, readonly string[]> = {
  pro: [
    'לפרטים נוספים ולתיאום ביקור — מוזמנים ליצור קשר.',
    'מוזמנים לתאם ביקור ולהתרשם מקרוב.',
    'לתיאום צפייה בנכס אפשר לפנות ישירות בוואטסאפ.',
  ],
  warm: [
    'נשמח לארח אתכם לביקור ולהכיר את הבית מקרוב.',
    'רוצים לראות בעיניים? כתבו לנו בוואטסאפ ונקבע.',
    'מוזמנים לבוא, להסתובב ולהרגיש את המקום.',
  ],
  refined: ['ביקור בתיאום מראש.', 'לתיאום ביקור — בוואטסאפ.', 'פרטים נוספים ותיאום צפייה לפי בקשה.'],
};

function closing(input: AgentCopyInput, variant: number): string {
  const terms = [
    entryPhrase(input.facts),
    has(input.facts, 'has_tenants') ? 'הנכס מושכר כעת.' : undefined,
  ].filter((part): part is string => part !== undefined);
  const lines = CLOSINGS[input.tone ?? 'pro'];
  return [...terms, lines[variant] ?? lines[0]].join(' ');
}

// -------------------------------------------------------------------- the text

/**
 * The description with no model involved, in one of AGENT_VARIANTS phrasings.
 * Property only — a car has no neighbourhood and keeps listing-copy.ts.
 * Empty when the seller answered nothing that could be said.
 */
export function agentDescription(input: AgentCopyInput, variant = 0): string {
  const v = ((variant % AGENT_VARIANTS) + AGENT_VARIANTS) % AGENT_VARIANTS;
  const apartmentLine = apartment(input, v);
  const buildingLine = building(input, v);
  if (!apartmentLine && !buildingLine && numberOf(input.facts, 'rooms') === undefined) return '';

  const property = [opening(input, v), apartmentLine, buildingLine]
    .filter((part): part is string => part !== undefined)
    .join(' ');
  const area = neighbourhood(input, v);

  return [property, area, closing(input, v)]
    .filter((part): part is string => part !== undefined && part !== '')
    .join('\n\n');
}

/** Every variant, so a caller can pick one that differs from the last. */
export function agentDescriptions(input: AgentCopyInput): string[] {
  return Array.from({ length: AGENT_VARIANTS }, (_, variant) => agentDescription(input, variant));
}

const same = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/**
 * The fallback for this press of the button.
 *
 * First press: variant 0. "הצע תיאור אחר": the variant AFTER the one in the
 * box, so three presses walk through all three instead of bouncing between
 * two; and when the box holds something else (the model's text, or the
 * agent's own edit), the first variant that differs from it.
 */
export function nextAgentDescription(input: AgentCopyInput, previous = ''): string {
  const variants = agentDescriptions(input);
  const before = previous.trim();
  if (before === '') return variants[0] ?? '';

  const at = variants.findIndex((variant) => same(variant, before));
  const start = at === -1 ? 0 : at + 1;
  for (let step = 0; step < variants.length; step += 1) {
    const candidate = variants[(start + step) % variants.length];
    if (candidate !== undefined && !same(candidate, before)) return candidate;
  }
  return variants[0] ?? '';
}

// ------------------------------------------------------------------ the model

export const AGENT_SYSTEM_PROMPT =
  'אתה מתווך נדל״ן ישראלי מקצועי שכותב תיאור למודעת מכירה של דירה, בעברית. ' +
  'מבנה, בשלוש פסקאות קצרות המופרדות בשורה ריקה: ' +
  'פסקה ראשונה — משפט פתיחה (חדרים, שכונה ועיר), ואחריו הדירה: שטח, קומה, מצב, מרפסת, כיווני אוויר, ואז הבניין: מעלית, חניה, ממ״ד, מחסן. ' +
  'פסקה שנייה — השכונה: תחבורה ציבורית, קניות יומיומיות, בתי ספר וגנים, פנאי ותרבות, כל אחד בשם מהרשימה ועם זמן ההליכה שנמסר לידו. ' +
  'פסקה שלישית — משפט סיום קצר: מועד כניסה אם נמסר, והזמנה לתאם ביקור. ' +
  'מותר לכתוב רק עובדות ושמות שמופיעים ברשימה שנמסרה לך. אסור להמציא מספר, מקום, קו אוטובוס, מוסד או מרחק. ' +
  'זמני הליכה רק בצורה שנמסרה, למשל "7 דקות הליכה". מקום בלי זמן — בלי זמן. ' +
  'רק מה שיש — מה שחסר לא נכתב, ואסור לכתוב שמשהו חסר. ' +
  'אסור שווי, השקעה, תשואה, פוטנציאל או ערך עתידי. ' +
  'אסור מילות הפלגה כמו חלומית, מדהימה, ייחודית, מושלמת, יוקרתית. ' +
  'עברית רהוטה של מתווך, בלי כותרות, בלי רשימת נקודות, בלי אמוג׳י, בלי שם של מודל, בלי אנגלית.';

function factLine(fact: Fact): string {
  const unit = fact.unit ? ` ${fact.unit}` : '';
  return `- ${fact.label}: ${String(fact.value)}${unit}`;
}

/** The user message: the facts, then the surroundings as name and minutes only. */
export function agentPrompt(input: AgentCopyInput): string {
  const facts = input.facts.filter(
    (fact) => fact.present !== false && fact.value !== null && fact.value !== '',
  );
  const lines: string[] = [`סוג הנכס: ${schemaFor(input.category).label}`];
  if (input.city) lines.push(`עיר: ${input.city}`);
  lines.push('', 'עובדות על הנכס:', ...facts.map(factLine));
  if (input.sellerNotes?.trim()) lines.push('', `דברי המוכר: ${input.sellerNotes.trim()}`);

  const places = input.places;
  if (places && hasPlaces(places)) {
    const near = around(places);
    const hood = nearest(places.neighbourhoods)[0];
    const group = (label: string, items: readonly AreaPlace[]) =>
      items.length > 0 ? [`${label}: ${items.map(named).join(', ')}`] : [];
    lines.push(
      '',
      'הסביבה (רק השמות האלה מותרים):',
      ...(hood ? [`שכונה: ${hood.name}`] : []),
      ...group('תחבורה ציבורית', near.transit),
      ...group('קניות יומיומיות', near.shops),
      ...group('בתי ספר וגנים', near.schools),
      ...group('פנאי ותרבות', near.leisure),
    );
  } else {
    lines.push('', 'אין מידע על הסביבה — לא לכתוב פסקת שכונה.');
  }

  return lines.join('\n');
}

/** The model's text tidied, keeping the paragraph breaks the page renders. */
export function tidyParagraphs(raw: string): string {
  return raw
    .replace(/\*\*/g, '')
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim().replace(/^["«»]+|["«»]+$/g, '').trim())
    .filter((paragraph) => paragraph !== '')
    .join('\n\n');
}

const HEBREW = /[֐-׿]/;
const MIN_CHARS = 60;
const MAX_CHARS = 1400;

/** Area words a description may not use when no surroundings were looked up. */
const AREA_CLAIM = /דקות הליכה|דקה הליכה|תחנת |בית ספר|בתי ספר|אוטובוס|רכבת|סופרמרקט|פארק/;

/**
 * Admits a model's description, or undefined so the caller falls back.
 *
 * Every number must be a fact the seller answered or a routed minute we were
 * given; every school, station, park, culture place or shop it mentions must
 * be one of the named places; no other city, no head count, no valuation, no
 * superlative. Failing is cheap — the fallback is the same structure.
 */
export function acceptAgentDescription(raw: string, input: AgentCopyInput): string | undefined {
  const text = tidyParagraphs(raw);

  if (text.length < MIN_CHARS || text.length > MAX_CHARS) return undefined;
  if (!HEBREW.test(text)) return undefined;
  if (/https?:\/\//i.test(text)) return undefined;
  if (/deepseek|openai|chatgpt|gpt/i.test(text)) return undefined;
  if (findBannedWords(text).length > 0) return undefined;
  if (findReservedTopics(text).length > 0) return undefined;

  const places = input.places && hasPlaces(input.places) ? input.places : undefined;
  const minutes = places ? routedMinutes(places) : new Set<string>();
  const unsupported = findUnsupportedNumbers(text, input.facts).filter((number) => !minutes.has(number));
  if (unsupported.length > 0) return undefined;

  if (places) {
    if (!mentionsGrounded(text, places)) return undefined;
  } else if (AREA_CLAIM.test(text)) {
    return undefined;
  }

  return text;
}

/**
 * Whether the description already carries the neighbourhood, so the page's
 * own area paragraph would only repeat it. True when it names any of the
 * places the surroundings list holds.
 */
export function descriptionCoversArea(description: string, places: AreaPlaces | undefined): boolean {
  if (!places || !hasPlaces(places)) return false;
  const near = around(places);
  return [...near.transit, ...near.shops, ...near.schools, ...near.leisure].some((place) =>
    description.includes(place.name),
  );
}
