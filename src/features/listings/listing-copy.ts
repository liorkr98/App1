import type { Fact } from '../../types/listing.js';

import { roomPhrase } from './hebrew-plural.js';

import {
  buildPrompt,
  findBannedWords,
  findReservedTopics,
  findUnsupportedNumbers,
  tidyParagraph,
} from './description.js';
import { factDefinition, schemaFor, type ListingCategory } from './schemas/index.js';

/**
 * The listing description, from the seller's own answers.
 *
 * WHY THIS EXISTS. The editor's description step was a bare textarea. There
 * was a prompt builder (description.ts), there were guards on model output,
 * there was a grounded area paragraph (neighborhood-note.ts) — and nothing
 * anywhere called any of them, so `generatedDescription` was a field no code
 * ever set. An agent selling a flat in four minutes was asked to write
 * advertising copy from scratch, on a phone, which is the slowest step in the
 * flow and the one they are least equipped for.
 *
 * TWO SOURCES, ONE SHAPE. `groundedDescription` builds the paragraph from the
 * facts with no model at all; `acceptDescription` admits a model's paragraph
 * only if it survives the same grounding rules. The editor shows whichever it
 * got and the seller edits it — generated text is never published unedited
 * (E6), and that gate is unchanged.
 *
 * THE FALLBACK IS NOT A DEGRADED MODE. It is the product working without a
 * model key: same facts, same order, plainer sentences. A page that says
 * "דירה בתל אביב, 4 חדרים, 95 מ״ר, קומה 3. יש מעלית, חניה וממ״ד." is a
 * description an agent can send. Nothing here waits on a provider.
 *
 * GROUNDING IS THE WHOLE CONSTRAINT (CLAUDE.md §7). Every noun comes from a
 * fact the seller answered or from the enrichment paragraph, which is itself
 * built from named registers. There is no sentence about the area that the
 * data did not supply, no valuation, and no superlative.
 */

/** What a description may be built from. Nothing else reaches the prose. */
export interface ListingCopyInput {
  category: ListingCategory;
  facts: readonly Fact[];
  /** Hebrew city. A vehicle has none and gets no location sentence. */
  city?: string;
  /**
   * The grounded area paragraph, when proximity ran for this listing. Named
   * stops and schools with routed minutes, already validated upstream.
   */
  areaNote?: string;
  /** The seller's own words, when they wrote some. Never invented for them. */
  sellerNotes?: string;
}

/** Answered, and not a confirmed absence. Absence belongs to the grid (§7). */
function usable(facts: readonly Fact[]): Fact[] {
  return facts.filter(
    (fact) => fact.present !== false && fact.value !== null && fact.value !== '',
  );
}

/**
 * How many digits a number keeps its separators for.
 *
 * A year is an identifier — 2021 grouped reads "2,021" — and the schema
 * already records that with `grouped: false`.
 */
function formatValue(category: ListingCategory, fact: Fact): string {
  const definition = factDefinition(category, fact.key);

  if (typeof fact.value === 'number' && definition?.grouped !== false) {
    return fact.value.toLocaleString('he-IL');
  }
  return String(fact.value);
}

/**
 * Each answered fact as a Hebrew sentence fragment, in schema order.
 *
 * A fact with no `phrase` is SKIPPED rather than guessed at. Hebrew word order
 * is not derivable from a label — "4 חדרים" and "קומה 3" put the number on
 * opposite sides — and a wrong guess is visible to every reader.
 *
 * `measured` fragments carry an answer and belong in the opening sentence.
 * `features` are the yes/no ones and read as a list: "יש מעלית, חניה וממ״ד".
 */
export function factFragments(input: ListingCopyInput): {
  measured: string[];
  features: string[];
} {
  const measured: string[] = [];
  const features: string[] = [];

  for (const fact of usable(input.facts)) {
    const phrase = factDefinition(input.category, fact.key)?.phrase;
    if (!phrase) continue;

    if (fact.key === 'rooms' && typeof fact.value === 'number') {
      measured.push(roomPhrase(fact.value));
      continue;
    }

    if (fact.type === 'boolean') {
      // A boolean's phrase is the thing itself — 'מעלית'. A confirmed absence
      // never reaches here: usable() drops it, and a listing does not
      // advertise what it lacks.
      if (fact.value === true) features.push(phrase.replace('{value}', '').trim());
      continue;
    }

    measured.push(phrase.replace('{value}', formatValue(input.category, fact)));
  }

  return { measured, features };
}

/** "א, ב ו־ג" — the last item joined with a vav, as Hebrew does. */
function hebrewList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ו${items[items.length - 1]}`;
}

/**
 * The paragraph, with no model involved.
 *
 * Sentence one is what it is and where: the category, the city, and the facts
 * that carry a measurement. Sentence two is what it has — the yes/no features,
 * as a list. Then the seller's own note, then the area paragraph if proximity
 * ran. Anything missing is simply not a sentence.
 */
export function groundedDescription(
  input: ListingCopyInput,
  options: { alternate?: boolean } = {},
): string {
  const schema = schemaFor(input.category);
  const { measured, features } = factFragments(input);

  const opening = [
    input.city ? `${schema.label} ב${input.city}` : schema.label,
    ...measured,
  ].join(', ');

  const featureLine = features.length > 0 ? `יש ${hebrewList(features)}.` : undefined;
  const sentences: string[] =
    options.alternate && featureLine
      ? [featureLine, `${opening}.`]
      : [`${opening}.`, ...(featureLine ? [featureLine] : [])];

  const notes = input.sellerNotes?.trim();
  if (notes) sentences.push(notes.endsWith('.') ? notes : `${notes}.`);

  // Surroundings stay in the enrichment block. A description that names
  // the same schools and walk times as the map reads as machine output.
  if (measured.length === 0 && features.length === 0 && !notes) return '';

  return sentences.join(' ');
}

/**
 * What the model is told. The rules are the product, not integration detail.
 */
export const DESCRIPTION_SYSTEM_PROMPT =
  'אתה כותב תיאור למודעת מכירה בעברית. פסקה אחת, שניים עד ארבעה משפטים. ' +
  'התיאור על הנכס עצמו: חדרים, מצב, אור, תכנון, מה שופץ, איך המרפסת. ' +
  'אסור לכתוב על הסביבה — בלי בתי ספר, בלי תחנות, בלי חנויות, בלי זמני הליכה. ' +
  'מותר לכתוב רק עובדות שמופיעות ברשימה שנמסרה לך. ' +
  'אסור להמציא מספר, מקום, שם מוסד או מרחק. ' +
  'רק מה שיש — מה שחסר לא נכתב, ואסור לכתוב שמשהו חסר. ' +
  'אסור שווי, השקעה, תשואה, פוטנציאל או ערך עתידי. ' +
  'אסור מילות הפלגה כמו חלומית, מדהימה, ייחודית, מושלמת, יוקרתית. ' +
  'בלי כותרת, בלי רשימת נקודות, בלי שם של מודל, בלי אמוג׳י.';

/** The user message: the same facts the fallback paragraph is built from. */
export function descriptionPrompt(input: ListingCopyInput): string {
  return buildPrompt({
    categoryLabel: schemaFor(input.category).label,
    facts: input.facts,
    ...(input.city ? { city: input.city } : {}),
    ...(input.sellerNotes ? { sellerNotes: input.sellerNotes } : {}),
  });
}

/**
 * Second press of "הצע תיאור אחר": same facts, a different paragraph.
 *
 * Without this the model (and the deterministic fallback) return the same
 * sentences, so the button looks dead.
 */
export function rewriteInstruction(previous: string): string {
  const text = previous.trim();
  if (text === '') return '';
  return (
    'כתוב ניסוח אחר לגמרי. שנה את הפתיחה ואת סדר המשפטים. ' +
    'אסור לחזור על הפסקה הזו מילה במילה:\n' +
    text
  );
}

export function appendRewrite(prompt: string, previous?: string): string {
  const extra = previous ? rewriteInstruction(previous) : '';
  return extra === '' ? prompt : `${prompt}\n\n${extra}`;
}

export function sameParagraph(a: string, b: string): boolean {
  return a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
}

/** Hebrew has to be present, or the model answered in the wrong language. */
const HEBREW = /[\u0590-\u05FF]/;

const MIN_CHARS = 40;
const MAX_CHARS = 900;

/**
 * Admits a model's paragraph, or returns undefined.
 *
 * FAILING IS NORMAL AND CHEAP. The caller falls back to
 * `groundedDescription`, so a reply that invents a number costs the seller
 * nothing but a plainer paragraph. That is the trade this product wants: it is
 * the page an agent sends, and an invented fact on it is their professional
 * reputation, not ours.
 */
export function acceptDescription(
  raw: string,
  input: ListingCopyInput,
): string | undefined {
  const text = tidyParagraph(raw);

  if (text.length < MIN_CHARS || text.length > MAX_CHARS) return undefined;
  if (!HEBREW.test(text)) return undefined;
  if (/https?:\/\//i.test(text)) return undefined;
  if (/deepseek|openai|chatgpt|gpt/i.test(text)) return undefined;
  if (findBannedWords(text).length > 0) return undefined;
  if (findReservedTopics(text).length > 0) return undefined;

  // Walking times and place names belong to the enrichment block. A
  // description that repeats them is rejected, even when the area note
  // was passed in by an older caller.
  if (/דקות הליכה|דקה הליכה|תחנת |בית ספר|אוטובוס|רכבת/.test(text)) return undefined;

  const unsupported = findUnsupportedNumbers(text, input.facts);
  if (unsupported.length > 0) return undefined;

  return text;
}
