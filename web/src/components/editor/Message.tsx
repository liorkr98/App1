import { Fragment, type ReactNode } from 'react';

import { formatValue, parts } from '../../lib/i18n';

interface Props {
  /** Dotted path into locales/he.json, e.g. 'editor.blockers.photosTooFew'. */
  path: string;
  /** One entry per {placeholder} in the message. */
  values?: Record<string, string | number | ReactNode>;
}

/**
 * One Hebrew message, with every interpolated value isolated from the Hebrew
 * around it.
 *
 * CLAUDE.md §4.2. The failure this prevents is invisible until it is in front
 * of a seller: in an RTL paragraph the digits of `25` run left-to-right, and
 * the bidi algorithm decides where that run belongs by looking at what sits
 * on either side of it. Punctuation and a second number are enough to move it
 * somewhere it was never meant to be.
 *
 * <bdi> isolates the run so the surrounding Hebrew cannot reorder it, and
 * doing it here, once, is why no caller has to remember.
 *
 * WHAT <bdi> DOES NOT FIX. It carries dir="auto", and auto picks a direction
 * from the first STRONG character in the content. A list like `3, 7` contains
 * none, so auto falls back to the paragraph direction and lays the list out
 * right-to-left — the seller is shown `7 ,3`, numbers they never wrote. So a
 * list is passed as a NODE, one <bdi> per number (see NumberList), and never
 * as a joined string.
 */
export function Message({ path, values }: Props) {
  return (
    <>
      {parts(path).map((part, index) => {
        if ('text' in part) return <Fragment key={index}>{part.text}</Fragment>;

        const supplied = values?.[part.slot];

        // An unfilled placeholder stays as written. Dropping it silently
        // would leave a sentence that reads fine and says the wrong thing.
        if (supplied === undefined) return <Fragment key={index}>{`{${part.slot}}`}</Fragment>;

        return typeof supplied === 'string' || typeof supplied === 'number' ? (
          <bdi key={index}>{formatValue(supplied)}</bdi>
        ) : (
          <Fragment key={index}>{supplied}</Fragment>
        );
      })}
    </>
  );
}

/**
 * A comma-separated list where each item is isolated on its own.
 *
 * The separators sit OUTSIDE the isolates, in the Hebrew run, which is what
 * makes the list read right-to-left while each item reads correctly inside
 * itself — the behaviour a single <bdi> around the joined string cannot give.
 */
export function NumberList({ items }: { items: readonly string[] }) {
  return (
    <>
      {items.map((item, index) => (
        <Fragment key={item}>
          {index > 0 ? ', ' : null}
          <bdi>{item}</bdi>
        </Fragment>
      ))}
    </>
  );
}
