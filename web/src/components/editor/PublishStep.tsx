import type { Blocker, EditorState } from '@/features/listings/editor';

import { t } from '../../lib/i18n';

interface Props {
  state: EditorState;
  blockers: readonly Blocker[];
  publishedUrl?: string | undefined;
  publishedSlug?: string | undefined;
  publishing: boolean;
  onPublish: () => void;
  onCopy: (url: string) => void;
  onIndexable: (indexable: boolean) => void;
}

/**
 * The last step: publish, and the link.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8: the paywall may be built here and ENTITLEMENT MAY NOT BE
 * DECIDED here.
 *
 * Nothing in this file reads, infers or grants entitlement. It renders what
 * `blockers()` returns, and the button is disabled whenever that list is
 * non-empty. The two payment codes get DIFFERENT copy because they are
 * different situations:
 *
 *   paymentRequired   — not on the beta list (or unpaid, when a PSP exists)
 *   paymentUnverified — we could not check. Wait. Do not guess.
 *
 * There is no branch here that publishes when the entitlement check failed.
 * ======================================================================
 */
export function PublishStep({
  state,
  blockers: outstanding,
  publishedUrl,
  publishedSlug,
  publishing,
  onPublish,
  onCopy,
  onIndexable,
}: Props) {
  if (publishedUrl) {
    const shareHref = publishedSlug ? `/a/${publishedSlug}/share/` : publishedUrl;

    return (
      <div className="published">
        <h2 className="published-title">{t('editor.publish.done')}</h2>
        <p className="hint">{t('editor.publish.doneHint')}</p>

        <p className="published-link">
          <bdi>{publishedUrl}</bdi>
        </p>

        <div className="published-actions">
          <button type="button" onClick={() => onCopy(publishedUrl)}>
            {t('editor.publish.copy')}
          </button>
          <a className="choice" href={publishedUrl}>
            {t('editor.publish.open')}
          </a>
          <a className="choice" href={shareHref}>
            {t('editor.publish.share')}
          </a>
          <a className="choice" href="/mine/">
            {t('editor.publish.dashboard')}
          </a>
        </div>
      </div>
    );
  }

  const payment = outstanding.find(
    (blocker) => blocker.code === 'paymentRequired' || blocker.code === 'paymentUnverified',
  );

  return (
    <>
      <p className="hint">{t('editor.publish.lead')}</p>

      {payment?.code === 'paymentRequired' ? (
        <p className="hint">{t('editor.publish.payBeta')}</p>
      ) : null}
      {payment?.code === 'paymentUnverified' ? (
        <p className="hint">{t('editor.publish.payWait')}</p>
      ) : null}

      <label className="declare">
        <input
          type="checkbox"
          checked={state.indexable === true}
          onChange={(event) => onIndexable(event.target.checked)}
        />
        <span>{t('editor.publish.indexable')}</span>
      </label>
      <p className="plate-note">{t('editor.publish.indexableWhy')}</p>

      <button
        type="button"
        className="publish-action"
        disabled={outstanding.length > 0 || publishing}
        onClick={onPublish}
      >
        {publishing ? t('editor.publish.publishing') : t('editor.publish.action')}
      </button>
    </>
  );
}
