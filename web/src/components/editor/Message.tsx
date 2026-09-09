import { Fragment } from 'react';

import { parts, type Values } from '../../lib/i18n';

interface Props {
  /** Dotted path into locales/he.json, e.g. 'editor.blockers.photosTooFew'. */
  path: string;
  values?: Values;
}

/**
 * One Hebrew message, with every interpolated value wrapped in <bdi>.
 *
 * CLAUDE.md §4.2. The failure this prevents is invisible until it is in front
 * of a seller: in an RTL paragraph the digits of `25` run left-to-right, and
 * the bidi algorithm decides where that run belongs by looking at what sits
 * on either side of it. Punctuation and a second number are enough to move it
 * somewhere it was never meant to be — `עד 25 תמונות` is safe today and stops
 * being safe the moment the sentence around it changes.
 *
 * <bdi> isolates the run so the surrounding Hebrew cannot reorder it. Doing
 * it here, once, is why no caller has to remember.
 *
 * Literal text is a Fragment rather than a <span>: the wrapper would be the
 * only element between the text and the paragraph, and an inline box with its
 * own direction context is precisely what this component exists to avoid.
 */
export function Message({ path, values }: Props) {
  return (
    <>
      {parts(path, values).map((part, index) =>
        'value' in part ? (
          <bdi key={index}>{part.value}</bdi>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
