import type { ReactNode } from 'react';

import type { Blocker, EditorState } from '@/features/listings/editor';

import type { AreaClientStatus } from '../../lib/area-request';
import { t } from '../../lib/i18n';
import { AreaLine } from './AreaLine';
import { Paywall } from './Paywall';

interface Props {
  state: EditorState;
  /** Everything still standing between this listing and a link. */
  blockers: readonly Blocker[];
  /** Set once the listing is live. The link is the product. */
  publishedUrl?: string | undefined;
  publishedSlug?: string | undefined;
  publishing: boolean;
  /** Which part of publishing is running: 1 save, 2 the area, 3 live, 4 the card. */
  publishStage?: number;
  /** What publishing is waiting on right now, e.g. the neighbourhood. */
  publishNote?: string | undefined;
  /** Where the neighbourhood lookup stands, shown before the button. */
  areaStatus?: AreaClientStatus | undefined;
  areaCount?: number | undefined;
  /** The photo checklist's one-line form (PhotoChecklist). Advice only. */
  photoCheck?: ReactNode;
  /** The WhatsApp line: the agent's own, or DeepSeek's (18 Oct 2026). */
  shareLineField?: ReactNode;
  /** What the agent adds to this page (PageOptions, 0047). */
  optionsField?: ReactNode;
  /**
   * Why the last publish attempt did not produce a link.
   *
   * A locale key, already resolved by the caller. Publishing used to fail in
   * silence — the button stopped spinning, no link appeared, and the agent had
   * no way to tell a refused publish from a slow one.
   */
  failure?: string | undefined;
  /** A paid plan at its active-page limit: the paywall offers the next plan up. */
  planCapped?: boolean;
  onPublish: () => void;
  onCopy: (url: string) => void;
  /** Opens the share sheet: WhatsApp, Facebook, the phone's menu, the link. */
  onShare: () => void;
  onIndexable: (indexable: boolean) => void;
  onPrePortal: (prePortal: boolean) => void;
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
 * WHAT AN AGENT WILL ACTUALLY SEE depends on `publish_decision()` (migration
 * 0040): a live plan, a one-time purchase, or one of the two free pages
 * (with נבנה עם עמוד מכירה). Unpaid opens the paywall; unknown waits. The
 * database trigger is the real publish gate.
 */
export function PublishStep({
  state,
  blockers,
  publishedUrl,
  publishing,
  publishStage = 1,
  publishNote,
  areaStatus,
  areaCount,
  photoCheck,
  shareLineField,
  optionsField,
  failure,
  planCapped,
  onPublish,
  onCopy,
  onShare,
  onIndexable,
  onPrePortal,
}: Props) {
  // The link exists: nothing else on this step matters any more.
  if (publishedUrl) {
    return (
      <div className="published">
        {/* Drawn once, the moment the link exists; still for a reader who
            asked for less motion. */}
        <svg className="published-mark" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r="24" pathLength={1} />
          <path d="M15 27l7.5 7.5L38 19" pathLength={1} />
        </svg>
        <h2 className="published-title">{t('editor.publish.done')}</h2>
        <p className="hint">{t('editor.publish.doneHint')}</p>

        <div className="published-link">
          {/* dir="ltr" on the URL alone. A Latin URL inside an RTL document
              reorders its slashes without it (CLAUDE.md §4.2). */}
          <code dir="ltr">{publishedUrl}</code>
        </div>

        <div className="published-actions">
          <button type="button" className="primary" onClick={onShare}>
            {t('editor.publish.shareNow')}
          </button>
          <button type="button" className="secondary" onClick={() => onCopy(publishedUrl)}>
            {t('dash.copyLink')}
          </button>
          <a className="secondary" href={publishedUrl}>
            {t('editor.publish.open')}
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

      {shareLineField}

      {optionsField}

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
      {state.entitlement === 'free' && !payment ? (
        <p className="field-hint">{t('editor.publish.freeHint')}</p>
      ) : null}

      {payment?.code === 'paymentRequired' ? <Paywall category={state.category} capped={planCapped ?? false} /> : null}
      {payment?.code === 'paymentUnverified' ? (
        <div className="paywall">
          <p>{t('editor.blockers.paymentUnverified')}</p>
          <p className="field-hint">{t('editor.publish.payWait')}</p>
        </div>
      ) : null}

      <label className="declare">
        <input
          type="checkbox"
          checked={state.prePortal === true}
          onChange={(event) => onPrePortal(event.target.checked)}
        />
        <span>{t('editor.publish.prePortal')}</span>
      </label>
      <p className="field-hint">{t('editor.publish.prePortalWhy')}</p>

      <label className="declare">
        <input
          type="checkbox"
          checked={state.indexable === true}
          onChange={(event) => onIndexable(event.target.checked)}
        />
        <span>{t('editor.publish.indexable')}</span>
      </label>
      <p className="field-hint">{t('editor.publish.indexableWhy')}</p>

      {failure ? (
        <p className="publish-failure" role="alert">
          {failure}
        </p>
      ) : null}

      {publishedUrl ? null : <AreaLine status={areaStatus} count={areaCount} />}
      {publishedUrl ? null : photoCheck}

      <button
        type="button"
        className="publish-button"
        disabled={blockers.length > 0 || publishing}
        onClick={onPublish}
      >
        {publishing ? (
          /*
           * Real stages, not a spinner: an agent waiting on a neighbourhood
           * lookup should see that, not wonder whether the button took.
           * The ring fills a quarter per stage and turns while one runs.
           */
          <span className="publish-progress">
            <svg className="publish-ring" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="publish-ring-track" cx="12" cy="12" r="10" />
              <circle
                className="publish-ring-fill"
                cx="12"
                cy="12"
                r="10"
                pathLength={100}
                style={{ strokeDashoffset: 100 - Math.min(4, Math.max(1, publishStage)) * 25 + 8 }}
              />
            </svg>
            <span aria-live="polite">
              {publishStage === 2 && publishNote
                ? publishNote
                : t(
                    publishStage >= 4
                      ? 'editor.publish.stageCard'
                      : publishStage === 3
                        ? 'editor.publish.stageLive'
                        : 'editor.publish.stageSave',
                  )}
            </span>
          </span>
        ) : (
          t('editor.publish.action')
        )}
      </button>

    </>
  );
}
