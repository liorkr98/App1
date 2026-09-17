import { useMemo } from 'react';

import { reviewDescription } from '@/features/listings/description';
import type { Fact } from '@/types/listing';

import { t } from '../../lib/i18n';
import { Message, NumberList } from './Message';

interface Props {
  text: string;
  generated?: string;
  facts: readonly Fact[];
  onChange: (text: string) => void;
  onSuggest?: (() => void) | undefined;
  suggesting?: boolean;
  suggestFailed?: string | undefined;
}

/**
 * The description step.
 *
 * Review flags are advisory. The only publish gate here is an empty box.
 * A suggested paragraph may go out as-is — the seller asked to stop being
 * forced to edit it before Next.
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

  return (
    <>
      <p className="hint">{t('editor.descriptionHint')}</p>

      <textarea
        className="description"
        value={text}
        rows={10}
        onChange={(event) => onChange(event.target.value)}
        aria-label={t('editor.steps.description')}
      />

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

      <section className="review" aria-live="polite">
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
            <Message
              path="editor.review.numbers"
              values={{ numbers: <NumberList items={review.unsupportedNumbers} /> }}
            />
          </p>
        ) : null}

        {review.clean && text !== '' ? (
          <p className="review-clean">{t('editor.review.clean')}</p>
        ) : null}
      </section>
    </>
  );
}
