import type { EditorState } from '@/features/listings/editor';
import { toCells } from '../../lib/facts';
import { ils } from '../../lib/format';
import { t } from '../../lib/i18n';

import type { EditorPhoto } from './PhotosStep';

interface Props {
  state: EditorState;
  photos: readonly EditorPhoto[];
}

/**
 * A sketch of the listing page, not the page itself.
 *
 * Rendering ListingPage.astro twice — once here, once at /a/{slug} — would
 * keep them in lockstep, but the listing page is an Astro tree with no JS
 * and this is a React island. A sketch that shares the tokens, the type, and
 * the facts grid order is honest about what it is, and it is enough for the
 * conversion moment: the seller sees their title, their price, their cover
 * and their facts before they pay.
 *
 * The WhatsApp bar is a <div>, labelled as a mock, so it cannot be tapped
 * and cannot look like a broken button.
 */
export function PreviewStep({ state, photos }: Props) {
  const cover = photos[0]?.publicUrl ?? photos[0]?.url;
  const cells = state.category
    ? toCells(state.category, state.facts, state.audience).slice(0, 6)
    : [];
  const place = [state.street, state.city].filter(Boolean).join(', ');

  return (
    <>
      <p className="hint">{t('editor.previewHint')}</p>

      <article className="preview-card" data-template={state.template ?? 'editorial'}>
        <div className="preview-hero">
          {cover ? (
            <img className="preview-cover" src={cover} alt="" />
          ) : (
            <div className="preview-cover preview-cover-empty" />
          )}

          <div className="preview-veil">
            {place ? <p className="preview-place">{place}</p> : null}
            <h2 className="preview-title">{state.title || '—'}</h2>
          </div>
        </div>

        <p className="preview-price">
          <bdi>{ils(state.price)}</bdi>
        </p>

        {cells.length > 0 ? (
          <ul className="preview-facts">
            {cells.map((cell) => (
              <li key={cell.key} className={cell.absent ? 'off' : undefined}>
                <strong>
                  {cell.bdi ? <bdi>{cell.value}</bdi> : cell.value}
                  {cell.pairedValue !== undefined ? (
                    <>
                      {' / '}
                      {cell.bdi ? <bdi>{cell.pairedValue}</bdi> : cell.pairedValue}
                    </>
                  ) : null}
                </strong>
                <span>{cell.label}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {state.description.trim() ? (
          <p className="preview-prose">{state.description.trim().split('\n\n')[0]}</p>
        ) : null}

        <div className="preview-cta" aria-hidden="true">
          {t('editor.previewCta')}
        </div>
        <p className="preview-cta-note">{t('editor.previewCtaNote')}</p>
      </article>
    </>
  );
}
