import type { Fact } from '../../types/listing.js';

/**
 * Description generation: the prompt, and the guards on what comes back.
 *
 * There is no model call here, deliberately. This module builds the prompt and
 * inspects the result; the provider sits between them behind one interface,
 * the same seam `enhanceAdvanced()` uses for image work. Nothing about the
 * rules below depends on which model runs.
 *
 * THE INPUT IS FACTS, NEVER PHOTOS.
 *
 * A model handed photographs will describe what it thinks it sees, and what it
 * thinks it sees in a blurry corner of a living room is a fireplace that does
 * not exist. Facts are things a person typed or a register supplied. That
 * constraint is the difference between a description and a fabrication, and it
 * is enforced by `buildPrompt` simply having nowhere to put an image.
 */

export interface DescriptionInput {
  /** Hebrew category label for the opening line, e.g. דירה, רכב. */
  categoryLabel: string;
  facts: readonly Fact[];
  /** The seller's own words, if they wrote any. Never invented for them. */
  sellerNotes?: string;
}

/**
 * Superlatives that are banned outright.
 *
 * The brief names three; the rest are their gender and number variants, which
 * a Hebrew model will reach for just as readily. Banning חלומית while allowing
 * חלומי would be theatre.
 *
 * The reason is not taste. Every listing on Yad2 says מדהימה, so the word
 * carries no information and actively costs credibility on a page whose whole
 * proposition is that its numbers can be checked.
 */
export const BANNED_SUPERLATIVES = [
  'חלומי',
  'חלומית',
  'מדהים',
  'מדהימה',
  'ייחודי',
  'ייחודית',
  'מושלם',
  'מושלמת',
  'יוקרתי',
  'יוקרתית',
  'נדיר',
  'נדירה',
  'מרהיב',
  'מרהיבה',
  'פנטסטי',
  'פנטסטית',
] as const;

/**
 * Topics the description must not make claims about.
 *
 * Not because they are untrue — because the ENRICHMENT SECTION already answers
 * them, from public registers, with a source and a date beside each figure. A
 * sentence in the prose saying "close to excellent schools" is an unsourced
 * claim sitting above a sourced one, and the unsourced one is what a reader
 * will remember.
 *
 * Future value is banned for a harder reason: it is a valuation, and §7
 * forbids presenting data as one.
 */
export const RESERVED_TOPICS = [
  'שכונה',
  'בית ספר',
  'בתי ספר',
  'גן ילדים',
  'תחבורה',
  'אוטובוס',
  'רכבת',
  'קו הרכבת',
  'השקעה',
  'עליית ערך',
  'פוטנציאל',
  'תשואה',
] as const;

/**
 * Builds the prompt.
 *
 * The instructions are part of the product, not a detail of the integration:
 * they are what keeps the generated paragraph on the honest side of the line
 * the whole page is built around.
 */
export function buildPrompt(input: DescriptionInput): string {
  const answered = input.facts.filter(
    (fact) => fact.present !== false && fact.value !== null && fact.value !== '',
  );

  const factLines = answered.map((fact) => {
    const unit = fact.unit ? ` ${fact.unit}` : '';
    const provenance = fact.source === 'verified' ? ' (מאומת)' : '';
    return `- ${fact.label}: ${String(fact.value)}${unit}${provenance}`;
  });

  return [
    `כתוב תיאור קצר ל${input.categoryLabel} למודעה בעברית.`,
    '',
    'העובדות שנמסרו:',
    ...factLines,
    ...(input.sellerNotes ? ['', 'מה שהמוכר כתב:', input.sellerNotes] : []),
    '',
    'כללים:',
    '- שניים עד שלושה פסקאות קצרות, בעברית מדוברת וטבעית.',
    '- לתאר, לא לשבח. בלי מילות הפלגה כמו חלומית, מדהימה, ייחודית.',
    '- אין להמציא עובדה שלא מופיעה ברשימה למעלה.',
    '- אין לכתוב על השכונה, בתי ספר, תחבורה ציבורית או ערך עתידי.',
    '- אין לכתוב מספר שלא מופיע ברשימה למעלה.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Guards on what comes back
// ---------------------------------------------------------------------------

/**
 * Superlatives present in the text.
 *
 * Overlapping matches are collapsed to the longest. Hebrew gendered pairs
 * nest — חלומי is a substring of חלומית, מדהים of מדהימה, ייחודי of ייחודית —
 * so a naive `includes` reports both forms for one word and hands a reviewer
 * two findings where there is one problem.
 */
export function findBannedWords(text: string): string[] {
  const found = BANNED_SUPERLATIVES.filter((word) => text.includes(word));

  return found.filter(
    (word) => !found.some((other) => other !== word && other.includes(word)),
  );
}

/** Reserved topics the text touches, which the enrichment section owns. */
export function findReservedTopics(text: string): string[] {
  return RESERVED_TOPICS.filter((topic) => text.includes(topic));
}

/**
 * Numbers in the text that no fact supports.
 *
 * The most useful of the three checks, because an invented NUMBER is the
 * hardest fabrication to spot by reading — "שלושה חדרים" in a two-room flat
 * looks exactly like a correct sentence.
 *
 * Small numbers written as words are not caught, and neither is a number that
 * happens to match an unrelated fact. This narrows what a reviewer has to
 * check; it does not replace them, which is why generated text can never be
 * published unedited.
 */
export function findUnsupportedNumbers(text: string, facts: readonly Fact[]): string[] {
  const supported = new Set<string>();

  for (const fact of facts) {
    if (fact.value === null) continue;
    const asText = String(fact.value);
    for (const number of asText.match(/\d+/g) ?? []) supported.add(number);
  }

  const used = text.match(/\d+/g) ?? [];
  return [...new Set(used)].filter((number) => !supported.has(number));
}

export interface DescriptionReview {
  bannedWords: string[];
  reservedTopics: string[];
  unsupportedNumbers: string[];
  /** True when nothing was flagged. Not a licence to publish — see below. */
  clean: boolean;
}

export function reviewDescription(text: string, facts: readonly Fact[]): DescriptionReview {
  const bannedWords = findBannedWords(text);
  const reservedTopics = findReservedTopics(text);
  const unsupportedNumbers = findUnsupportedNumbers(text, facts);

  return {
    bannedWords,
    reservedTopics,
    unsupportedNumbers,
    clean:
      bannedWords.length === 0 &&
      reservedTopics.length === 0 &&
      unsupportedNumbers.length === 0,
  };
}

/**
 * Whether the text is still exactly what the model produced.
 *
 * **Generated text is never published unedited** (E6). Not because the model
 * writes badly, but because the seller is the one making a representation
 * about their own property — and a description nobody read is a claim nobody
 * stands behind.
 *
 * Whitespace-insensitive so that a stray newline does not count as editing,
 * which would make the gate trivially bypassable by accident.
 */
export function isUnedited(generated: string, current: string): boolean {
  const normalise = (text: string): string => text.replace(/\s+/g, ' ').trim();
  return normalise(generated) === normalise(current);
}
