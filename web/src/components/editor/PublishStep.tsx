import type { Blocker, EditorState } from '@/features/listings/editor';

import { t } from '../../lib/i18n';

interface Props {
  state: EditorState;
  /** Everything still standing between this listing and a link. */
  blockers: readonly Blocker[];
  /** Set once the listing is live. The link is the product. */
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
 * THIS RENDERED NOTHING until 14 September 2026. An agent reached "שלב 7 מתוך
 * 7: פרסום" and found an empty box — no button, no price, no explanation.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8: the paywall may be built here and ENTITLEMENT MAY NOT BE
 * DECIDED here.
 *
 * Nothing in this file reads, infers or grants entitlement. It renders what
 * `blockers()` returns, and the button is disabled whenever that list is
 * non-empty. The two payment codes get DIFFERENT copy because they are
 * different situations and the agent can act on only one of them:
 * paymentRequired is a button they have not been given yet, paymentUnverified
 * is a wait.
 *
 * There is no branch here that publishes when the entitlement check failed,
 * and there must never be one.
 * ======================================================================
 *
 * WHAT AN AGENT WILL ACTUALLY SEE TODAY depends on `beta_publishers`. The
 * editor reads entitlement fail-closed; unpaid and unknown both block, with
 * different copy. There is no branch that publishes when the check failed.
 */
export function PublishStep({
  state,
  blockers,
  publishedUrl,
  publishedSlug,
  publishing,
  onPublish,
  onCopy,
  onIndexable,
}: Props) {
  // The link exists: nothing else on this step matters any more.
  if (publishedUrl) {
    const shareHref = publishedSlug ? `/a/${publishedSlug}/share/` : publishedUrl;
    return (
      <div className="published">
        <h2 className="published-title">{t('editor.publish.done')}</h2>
        <p className="hint">{t('editor.publish.doneHint')}</p>

        <div className="published-link">
          {/* dir="ltr" on the URL alone. A Latin URL inside an RTL document
              reorders its slashes without it (CLAUDE.md §4.2). */}
          <code dir="ltr">{publishedUrl}</code>
        </div>

        <div className="published-actions">
          <button type="button" className="primary" onClick={() => onCopy(publishedUrl)}>
            {t('dash.copyLink')}
          </button>
          <a className="secondary" href={publishedUrl}>
            {t('editor.publish.open')}
          </a>
          <a className="secondary" href={shareHref}>
            {t('editor.publish.share')}
          </a>
          <a className="secondary" href="/mine/">
            {t('dash.title')}
          </a>
        </div>
      </div>
    );
  }

  const payment = blockers.find(
    (blocker) => blocker.code === 'paymentRequired' || blocker.code === 'paymentUnverified',
  );
  return (
    <>
      <p className="hint">{t('editor.publish.hint')}</p>

      <dl className="summary">
        <div>
          <dt>{t('editor.details.title')}</dt>
          <dd>{state.title || '—'}</dd>
        </div>
        <div>
          <dt>{t('editor.details.price')}</dt>
          <dd>
            <bdi>{state.price > 0 ? `₪${state.price.toLocaleString('he-IL')}` : '—'}</bdi>
          </dd>
        </div>
        <div>
          <dt>{t('editor.publish.photos')}</dt>
          <dd>
            <bdi>{state.photoCount}</bdi>
          </dd>
        </div>
      </dl>

      {/*
        The fixable blockers are NOT listed here. The editor already shows
        every outstanding one in its own bar at the foot of the screen, and
        printing them twice on the one step where the agent is most anxious
        reads as two different problems rather than one. Seen on the running
        page, not reasoned about.

        The PAYWALL does still get its own block, because the footer states
        the rule and this explains the situation — and right now the
        situation is that it is nobody's fault.
      */}
      {payment && (
        <div className="paywall">
          <p>{t(`editor.blockers.${payment.code}`)}</p>
          <p className="field-hint">
            {t(
              payment.code === 'paymentUnverified'
                ? 'editor.publish.payWait'
                : 'editor.publish.payBeta',
            )}
          </p>
        </div>
      )}

      <label className="declare">
        <input
          type="checkbox"
          checked={state.indexable === true}
          onChange={(event) => onIndexable(event.target.checked)}
        />
        <span>{t('editor.publish.indexable')}</span>
      </label>
      <p className="field-hint">{t('editor.publish.indexableWhy')}</p>

      <button
        type="button"
        className="publish-button"
        disabled={blockers.length > 0 || publishing}
        onClick={onPublish}
      >
        {publishing ? t('editor.publish.working') : t('editor.publish.action')}
      </button>
    </>
  );
}
