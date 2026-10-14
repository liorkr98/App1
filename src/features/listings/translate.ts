/**
 * The listing in English, Russian or Arabic: the agent's own text, translated
 * by AI and checked by the agent before it is saved (migration 0044).
 *
 * What is translated is only what the seller wrote: the title, the
 * description, a free-text price note and the disclosures. Everything else on
 * the page — labels, facts, the area — comes from our own copy.
 *
 * THE RULES ARE THE PAGE'S RULES. A translation adds nothing (no adjective
 * the seller did not write, no claim, never a valuation) and keeps every
 * number: a price, a size or a year that comes back different is a wrong
 * page sent to a buyer, so an answer that loses one is refused here rather
 * than shown to the agent as if it were fine.
 */

export type TranslationLang = 'en' | 'ru' | 'ar';

export interface TranslationSource {
  title: string;
  description: string;
  priceNote?: string;
  disclosures?: readonly string[];
}

export interface TranslationDraft {
  title: string;
  description: string;
  priceNote?: string;
  disclosures?: string[];
}

const LANGUAGE_NAME: Record<TranslationLang, string> = {
  en: 'English',
  ru: 'Russian',
  ar: 'Arabic (Modern Standard, as read in Israel)',
};

export function translationSystem(language: TranslationLang): string {
  return [
    `You translate an Israeli property or vehicle listing from Hebrew into ${LANGUAGE_NAME[language]}.`,
    'Translate faithfully and naturally, the way a local agent would write it. Keep line breaks in the title.',
    'Add nothing: no adjectives, claims or details that are not in the Hebrew. Never estimate a value.',
    'Keep every number, price, size, year and date exactly as written, with Western digits.',
    'Keep names of streets, neighbourhoods, cities, people and businesses as they are commonly written in the target language; when unsure, transliterate.',
    'Use Israeli terms the reader will meet: ממ״ד is a "safe room (mamad)", ארנונה is "arnona (municipal tax)", טסט is the annual roadworthiness test.',
    'Answer with JSON only: {"title": "...", "description": "...", "priceNote": "...", "disclosures": ["..."]}.',
    'Include priceNote and disclosures only if they are in the input, with the same number of disclosures in the same order.',
  ].join('\n');
}

export function translationInput(source: TranslationSource): string {
  return JSON.stringify({
    title: source.title,
    description: source.description,
    ...(source.priceNote ? { priceNote: source.priceNote } : {}),
    ...(source.disclosures && source.disclosures.length > 0 ? { disclosures: source.disclosures } : {}),
  });
}

/** Every run of digits in a text, without grouping: "₪4,250,000" → "4250000". */
export function numbersIn(text: string): string[] {
  return [...text.replace(/(\d)[,.](?=\d{3}\b)/g, '$1').matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => match[0].replace(',', '.'));
}

function clean(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!text) return undefined;
  return text.length > max ? text.slice(0, max) : text;
}

export type TranslationResult = { ok: true; draft: TranslationDraft } | { ok: false; error: 'malformed' | 'numbers' };

/**
 * The model's answer, cut to shape: the same fields as the input, every
 * number the Hebrew had still there.
 */
export function parseTranslation(raw: string, source: TranslationSource): TranslationResult {
  let value: unknown;
  try {
    value = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return { ok: false, error: 'malformed' };
  }
  if (!value || typeof value !== 'object') return { ok: false, error: 'malformed' };
  const body = value as Record<string, unknown>;
  const title = clean(body.title, 300);
  const description = source.description ? clean(body.description, 6000) : '';
  if (!title || description === undefined) return { ok: false, error: 'malformed' };
  const priceNote = source.priceNote ? clean(body.priceNote, 200) : undefined;
  if (source.priceNote && !priceNote) return { ok: false, error: 'malformed' };
  let disclosures: string[] | undefined;
  if (source.disclosures && source.disclosures.length > 0) {
    const list = Array.isArray(body.disclosures) ? body.disclosures.map((item) => clean(item, 600)) : [];
    if (list.length !== source.disclosures.length || list.some((item) => !item)) return { ok: false, error: 'malformed' };
    disclosures = list as string[];
  }

  const before = numbersIn([source.title, source.description, source.priceNote ?? '', ...(source.disclosures ?? [])].join('\n'));
  const after = new Set(numbersIn([title, description, priceNote ?? '', ...(disclosures ?? [])].join('\n')));
  if (before.some((number) => !after.has(number))) return { ok: false, error: 'numbers' };

  return {
    ok: true,
    draft: { title, description, ...(priceNote ? { priceNote } : {}), ...(disclosures ? { disclosures } : {}) },
  };
}

/** A hash of the Hebrew a translation was made from, to tell when it changed. FNV-1a. */
export function translationSource(source: TranslationSource): string {
  const text = JSON.stringify([source.title, source.description, source.priceNote ?? '', source.disclosures ?? []]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
