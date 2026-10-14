import he from '@locales/he.json';

/**
 * Hebrew copy, from locales/he.json (CLAUDE.md §12).
 *
 * Framework-free on purpose: .astro pages and the React island both need it,
 * and importing this from a page should not pull React into that page's
 * bundle.
 *
 * THE LISTING PAGE IN ENGLISH, RUSSIAN AND ARABIC (14 Oct 2026). Hebrew stays
 * the design baseline and the only language anywhere else. A listing page at
 * /a/{slug}/{en|ru|ar}/ is rendered in that language by the server:
 * lib/locale-server.ts registers the other dictionaries and says, per
 * request, which language is being rendered. In the browser nothing is ever
 * registered, so everything here is Hebrew, as before, and the other
 * dictionaries never reach a bundle.
 *
 * Two kinds of copy: keyed messages (`t`, `parts`), and Hebrew text that
 * lives in code — a fact's label in its schema, a place category, a unit —
 * which `tr` looks up by the Hebrew itself.
 */

export type Lang = 'he' | 'en' | 'ru' | 'ar';
export const PAGE_LANGS = ['en', 'ru', 'ar'] as const;
export type PageLang = (typeof PAGE_LANGS)[number];

export function isPageLang(value: unknown): value is PageLang {
  return (PAGE_LANGS as readonly unknown[]).includes(value);
}

interface Dictionary {
  /** The same shape as he.json; a missing or empty value falls back to Hebrew. */
  keys: Record<string, unknown>;
  /** Hebrew text in code → this language. */
  strings: Record<string, string>;
}

const dictionaries: Partial<Record<Lang, Dictionary>> = {};
let source: () => Lang = () => 'he';
let missing: ((kind: 'key' | 'string', what: string) => void) | undefined;

/** Server only (lib/locale-server.ts): the dictionaries and the per-request language. */
export function registerLocales(
  next: Partial<Record<PageLang, Dictionary>>,
  current: () => Lang,
  onMissing?: (kind: 'key' | 'string', what: string) => void,
): void {
  Object.assign(dictionaries, next);
  source = current;
  missing = onMissing;
}

/** The language being rendered: Hebrew everywhere but a translated listing page. */
export function lang(): Lang {
  return source();
}

export function dir(): 'rtl' | 'ltr' {
  const current = lang();
  return current === 'he' || current === 'ar' ? 'rtl' : 'ltr';
}

/**
 * Hebrew text from code, in the language being rendered. Unknown text stays
 * Hebrew (and is reported, so the test that renders every language can say
 * which string is missing).
 */
export function tr(text: string): string {
  const current = lang();
  if (current === 'he' || !text) return text;
  const found = dictionaries[current]?.strings[text];
  if (found) return found;
  missing?.('string', text);
  return text;
}

export type Values = Record<string, string | number>;

/**
 * A message split into literal text and the values interpolated into it.
 *
 * This exists because of CLAUDE.md §4.2: every number in a Hebrew sentence
 * has to be wrapped in <bdi>, and a function returning one finished string
 * gives the caller nothing to wrap. Without the split, `אפשר להעלות עד 25
 * תמונות` is a bidi bug waiting for the first two-digit number — the
 * paragraph direction is RTL, the digits are LTR, and the reordering puts
 * them where they were not meant to be.
 *
 * So the renderer gets the pieces and decides. See <Message> in the editor.
 */
export type Part = { readonly text: string } | { readonly slot: string };

const PLACEHOLDER = /\{(\w+)\}/g;

function walk(root: Record<string, unknown>, path: string): string | undefined {
  const found = path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === 'object'
          ? (node as Record<string, unknown>)[key]
          : undefined,
      root,
    );

  return typeof found === 'string' && found !== '' ? found : undefined;
}

function lookup(path: string): string | undefined {
  const current = lang();
  if (current !== 'he') {
    const found = walk(dictionaries[current]?.keys ?? {}, path);
    if (found !== undefined) return found;
    missing?.('key', path);
  }
  return walk(he, path);
}

/**
 * The message at `path`, as one string.
 *
 * For attributes and anywhere a ReactNode will not go — aria-label, title,
 * alt, <title>. For anything the seller READS on the page, prefer `parts`,
 * because this one cannot wrap an interpolated number in <bdi>.
 *
 * A missing key returns the key itself rather than throwing. A seller seeing
 * `editor.blockers.somethingNew` is bad; a white screen in the middle of the
 * flow they have already paid attention to is worse. The completeness test in
 * editor.test.ts is what stops it reaching them.
 */
export function t(path: string, values?: Values): string {
  const message = lookup(path);
  if (message === undefined) return path;
  if (!values) return message;

  return message.replace(PLACEHOLDER, (whole, key: string) =>
    key in values ? format(values[key]) : whole,
  );
}

/**
 * Message at `path`, split into literal text and named slots.
 *
 * Slots rather than substituted strings, so the renderer decides what goes
 * in one. That matters for more than styling: a LIST of numbers cannot be
 * dropped into a single <bdi>, because <bdi> defaults to dir="auto" and auto
 * looks for the first STRONG character to pick a direction. `3, 7` has none,
 * so it inherits the paragraph's RTL and renders as `7 ,3` — the seller is
 * shown numbers they did not write. Each number needs its own isolate, which
 * means the renderer needs the slot, not a finished string.
 */
export function parts(path: string): Part[] {
  const message = lookup(path);
  if (message === undefined) return [{ text: path }];

  const out: Part[] = [];
  let index = 0;

  PLACEHOLDER.lastIndex = 0;
  for (const match of message.matchAll(PLACEHOLDER)) {
    const at = match.index;
    const key = match[1] as string;

    if (at > index) out.push({ text: message.slice(index, at) });
    out.push({ slot: key });

    index = at + match[0].length;
  }

  if (index < message.length) out.push({ text: message.slice(index) });

  return out;
}

/** Number formatting for a slot value. Exported for the renderer. */
export function formatValue(value: string | number): string {
  return format(value);
}

/**
 * Numbers get Hebrew digit grouping. `he-IL` rather than the default locale:
 * a build machine in another timezone must not change what a seller reads.
 */
function format(value: string | number): string {
  // Western digits in every language: the agent wrote them, and Arabic in
  // Israel reads them (en-US groups the same way he-IL does).
  if (typeof value !== 'number') return value;
  return new Intl.NumberFormat(lang() === 'he' ? 'he-IL' : 'en-US').format(value);
}
