import { useMemo } from 'react';

import { isUnedited, reviewDescription } from '@/features/listings/description';
import type { Fact } from '@/types/listing';

import { t } from '../../lib/i18n';
import { Message, NumberList } from './Message';

interface Props {
  text: string;
  generated?: string;
  facts: readonly Fact[];
  onChange: (text: string) => void;
  /**
   * Asks the server for a suggestion. Absent when there is no row to ground
   * one in yet — a listing with no facts has nothing to describe.
   */
  onSuggest?: (() => void) | undefined;
  suggesting?: boolean;
  /** Hebrew, already resolved. Set when the last suggestion did not arrive. */
  suggestFailed?: string | undefined;
}

/**
 * The description step.
 *
 * Everything below the textarea is ADVISORY. reviewDescription flags three
 * things, and none of them stops publishing — blockers() gates on an empty
 * description and on generated text the seller never touched (E6), and that
 * is the whole gate today.
 *
 * Whether an unsupported number should also block is a product decision and
 * not mine to take: it is the one flag here that is about accuracy rather
 * than tone, and 3 in "3 דקות מהים" is a claim the page cannot source. It is
 * raised in the summary rather than settled in code.
 *
 * The warnings are worded as reasons, not as rules. "Marketing words: buyers
 * skip them" tells a seller something they can act on; "invalid input" tells
 * them they are being marked.
 */
export function DescriptionStep({
  text,
  generated,
  facts,
  onChange,
  onSuggest,
  suggesting,
  suggestFailed,
}: Props) {
  const review = useMemo(
    () => reviewDescription(text, facts, generated),
    [text, facts, generated],
  );
  const untouched = generated !== undefined && text !== '' && isUnedited(generated, text);

  return (
    <>
      <p className="hint">{t('editor.descriptionHint')}</p>

      <textarea
        className="description"
        value={text}
        rows={7}
        onChange={(event) => onChange(event.target.value)}
        aria-label={t('editor.steps.description')}
      />

      {/*
        The suggestion, and the sentence that says what to do with it.

        WORDED AS A DRAFT, NOT AS AN ANSWER. The seller has to edit it before
        publishing (E6) — not because the writing is poor, but because the
        claim is theirs. Copy that presented it as finished would make that
        gate feel like an obstacle instead of the point.
      */}
      {onSuggest ? (
        <div className="suggest">
          <button type="button" className="suggest-button" onClick={onSuggest} disabled={suggesting}>
            {suggesting
              ? t('editor.description.suggesting')
              : text.trim() === ''
                ? t('editor.description.suggest')
                : t('editor.description.suggestAgain')}
          </button>
          <p className="field-hint">{t('editor.description.suggestWhy')}</p>
        </div>
      ) : null}

      {suggestFailed ? (
        <p className="review-flag" role="alert">
          {suggestFailed}
        </p>
      ) : null}

      {/*
        aria-live, because this appears and changes as the seller types. Not
        assertive: it would interrupt them mid-sentence to say the sentence
        is not finished.
      */}
      <section className="review" aria-live="polite">
        {untouched ? (
          <p className="review-flag">
            <Message path="editor.blockers.descriptionUnedited" />
          </p>
        ) : null}

        {review.bannedWords.length > 0 ? (
          <p className="review-flag">
            <Message
              path="editor.review.banned"
              values={{ words: review.bannedWords.join(', ') }}
            />
          </p>
        ) : null}

        {review.reservedTopics.length > 0 ? (
          <p className="review-flag">
            <Message
              path="editor.review.reserved"
              values={{ topics: review.reservedTopics.join(', ') }}
            />
          </p>
        ) : null}

        {review.unsupportedNumbers.length > 0 ? (
          <p className="review-flag">
            {/*
              A NODE, not a joined string. One <bdi> around "3, 7" would be
              dir="auto" over content with no strong character, which falls
              back to RTL and shows the seller "7 ,3" — numbers they did not
              write. NumberList isolates each one separately.
            */}
            <Message
              path="editor.review.numbers"
              values={{ numbers: <NumberList items={review.unsupportedNumbers} /> }}
            />
          </p>
        ) : null}

        {review.clean && !untouched && text !== '' ? (
          <p className="review-clean">{t('editor.review.clean')}</p>
        ) : null}
      </section>
    </>
  );
}
