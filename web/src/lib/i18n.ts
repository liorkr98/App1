import he from '@locales/he.json';

/**
 * Hebrew copy, from locales/he.json (CLAUDE.md §12).
 *
 * Framework-free on purpose: .astro pages and the React island both need it,
 * and importing this from a page should not pull React into that page's
 * bundle.
 *
 * There is no locale switching here and that is not an oversight. Hebrew is
 * the design baseline, English is a secondary locale with an empty file, and
 * a runtime switcher for a locale with no strings in it would be dead code
 * that looks like a feature.
 */

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
export type Part = { readonly text: string } | { readonly value: string };

const PLACEHOLDER = /\{(\w+)\}/g;

function lookup(path: string): string | undefined {
  const found = path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === 'object'
          ? (node as Record<string, unknown>)[key]
          : undefined,
      he,
    );

  return typeof found === 'string' && found !== '' ? found : undefined;
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

/** Message at `path`, split so each interpolated value can be wrapped. */
export function parts(path: string, values?: Values): Part[] {
  const message = lookup(path);
  if (message === undefined) return [{ text: path }];

  const out: Part[] = [];
  let index = 0;

  PLACEHOLDER.lastIndex = 0;
  for (const match of message.matchAll(PLACEHOLDER)) {
    const at = match.index;
    const key = match[1] as string;

    if (at > index) out.push({ text: message.slice(index, at) });

    // An unknown placeholder stays as written. Silently dropping it would
    // leave a sentence that reads fine and says the wrong thing.
    const supplied = values && key in values ? values[key] : undefined;
    out.push(supplied === undefined ? { text: match[0] } : { value: format(supplied) });

    index = at + match[0].length;
  }

  if (index < message.length) out.push({ text: message.slice(index) });

  return out;
}

/**
 * Numbers get Hebrew digit grouping. `he-IL` rather than the default locale:
 * a build machine in another timezone must not change what a seller reads.
 */
function format(value: string | number): string {
  return typeof value === 'number' ? new Intl.NumberFormat('he-IL').format(value) : value;
}
