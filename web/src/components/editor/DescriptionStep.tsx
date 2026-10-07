import { useMemo } from 'react';

import { reviewDescription } from '@/features/listings/description';
import { COPY_TONES, type CopyTone } from '@/features/listings/listing-copy';
import type { Fact } from '@/types/listing';

import { t } from '../../lib/i18n';
import { Message, NumberList } from './Message';

/** The fallback reasons /api/description can give (see that route). */
const REASONS = ['no_key', 'no_answer', 'rejected', 'repeated'] as const;
type SuggestReason = (typeof REASONS)[number];

export interface SuggestSource {
  /** 'model' when the AI wrote it, 'facts' when the writer that needs none did. */
  by: 'model' | 'facts';
  reason?: SuggestReason;
  /** False when the text has no neighbourhood paragraph. */
  area: boolean;
}

/** The answer's JSON, before it is trusted. */
export interface SuggestAnswer {
  text?: unknown;
  source?: unknown;
  reason?: unknown;
  area?: unknown;
  areaPending?: unknown;
  error?: unknown;
}

export function sourceOf(body: SuggestAnswer): SuggestSource {
  const reason = REASONS.find((known) => known === body.reason);
  return {
    by: body.source === 'model' ? 'model' : 'facts',
    ...(reason ? { reason } : {}),
    area: body.area !== false,
  };
}

interface Props {
  text: string;
  generated?: string;
  facts: readonly Fact[];
  onChange: (text: string) => void;
  onSuggest?: (() => void) | undefined;
  /** The neighbourhood lookup is still working; the first draft waits for it. */
  waitingForArea?: boolean | undefined;
  suggesting?: boolean;
  suggestFailed?: string | undefined;
  /** Who wrote the text the last suggestion put in the box. */
  source?: SuggestSource | undefined;
  /** The voice the next suggestion is written in (listing-copy COPY_TONES). */
  tone?: CopyTone;
  onTone?: (tone: CopyTone) => void;
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
  waitingForArea = false,
  suggestFailed,
  source,
  tone = 'pro',
  onTone,
}: Props) {
  const review = useMemo(
    () => reviewDescription(text, facts, generated),
    [text, facts, generated],
  );

  return (
    <>
      <p className="hint">{t('editor.descriptionHint')}</p>

      <textarea
        className={suggesting ? 'description is-writing' : 'description'}
        aria-busy={suggesting || undefined}
        value={text}
        rows={10}
        onChange={(event) => onChange(event.target.value)}
        aria-label={t('editor.steps.description')}
      />

      {onSuggest && onTone ? (
        <div className="tone-row" role="group" aria-label={t('editor.tone.label')}>
          {COPY_TONES.map((option) => (
            <button
              key={option}
              type="button"
              className={option === tone ? 'tone-chip chosen' : 'tone-chip'}
              aria-pressed={option === tone}
              onClick={() => onTone(option)}
            >
              {t(`editor.tone.${option}`)}
            </button>
          ))}
        </div>
      ) : null}

      {onSuggest ? (
        <div className="suggest">
          <button type="button" className="suggest-button" onClick={onSuggest} disabled={suggesting}>
            {waitingForArea && !suggesting
              ? t('editor.description.waitingArea')
              : suggesting
              ? t('editor.description.suggesting')
              : text.trim() === ''
                ? t('editor.description.suggest')
                : t('editor.description.suggestAgain')}
          </button>
          <p className="field-hint">{t('editor.description.suggestWhy')}</p>
        </div>
      ) : null}

      {source && !suggesting ? (
        <p className={source.by === 'model' ? 'suggest-source by-model' : 'suggest-source'}>
          {t(`editor.description.source.${source.by}`)}
          {source.reason ? ` ${t(`editor.description.reason.${source.reason}`)}` : ''}
          {source.area ? '' : ` ${t('editor.description.noArea')}`}
        </p>
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
