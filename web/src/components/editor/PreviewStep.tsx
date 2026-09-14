import { accentFor } from '@/features/agents/accents';
import type { EditorState } from '@/features/listings/editor';
import { schemaFor } from '@/features/listings/schemas';
import { factsFromSchema, type Fact } from '@/types/listing';

import { factValue, ils, needsBdi, num } from '../../lib/format';
import { t } from '../../lib/i18n';
import type { EditorPhoto } from './PhotosStep';

interface Props {
  state: EditorState;
  photos: readonly EditorPhoto[];
  /** The agent's own details, for the bar and the seller block. */
  agency?: string | undefined;
  sellerName?: string | undefined;
  accent?: string | undefined;
  agencyLogoUrl?: string | undefined;
}

/**
 * The finished page, before it is published.
 *
 * THIS STEP RENDERED NOTHING AT ALL until 14 September 2026 — its heading and
 * an empty box, which is what "שלב 6 מתוך 7: תצוגה מקדימה" showed an agent who
 * had just spent four minutes filling in a form. Editor.tsx said so in its own
 * comments: "STILL EMPTY".
 *
 * WHY IT IS NOT AN IFRAME OF THE REAL PAGE, which would be the obvious answer
 * and was the first thing I tried. A draft has no public URL: the read policy
 * in 0002 exposes only 'published' and 'sold', and /a/[slug] reads with the
 * anon key, so a draft is a 404 there BY DESIGN. Handing the server the
 * agent's token to get around that would mean putting a credential in a URL
 * or inventing a cookie session the rest of the product does not use.
 *
 * So this renders the same page from the editor's own state. That is two
 * renderings of one page and therefore a drift risk — narrowed by having both
 * wear the SAME stylesheet: styles/listing.css, extracted from BaseListing for
 * this purpose. What can still differ is markup, which is the half a person
 * looking at the screen can see is wrong.
 *
 * SCALED, NOT RESPONSIVE. The listing page is a 620px document meant for a
 * phone. Shown at the editor's width it would be a different layout from the
 * one the buyer gets, which is the opposite of a preview.
 */
export function PreviewStep({ state, photos, agency, sellerName, accent, agencyLogoUrl }: Props) {
  const category = state.category ?? 'property';
  const schema = schemaFor(category);
  const palette = accentFor(accent);

  const cover = photos.find((photo) => photo.publicUrl ?? photo.url);
  const place = [state.street, state.city].filter(Boolean).join(', ');

  /*
   * The same three rules the real facts grid follows: a fact nobody answered
   * is OMITTED, and a fact confirmed absent renders greyed showing אין. They
   * are different answers and the page must never collapse one into the other
   * (CLAUDE.md §7).
   */
  const byKey = new Map(state.facts.map((fact) => [fact.key, fact]));
  const cells = factsFromSchema(schema)
    .map((blank): Fact => byKey.get(blank.key) ?? blank)
    .filter((fact) => fact.present === false || (fact.value !== null && fact.value !== ''))
    .slice(0, 6);

  const paragraphs = state.description.split('\n\n').filter((line) => line.trim() !== '');

  return (
    <>
      <p className="hint">{t('editor.preview.hint')}</p>

      {/* The frame is the phone; the document inside is the page. */}
      <div className="preview-frame">
        <div className="preview-page" style={{ ['--accent' as string]: palette.base }}>
          <div className="agent-bar">
            <div className="dot" aria-hidden="true">
              {agencyLogoUrl ? <img src={agencyLogoUrl} alt="" /> : null}
            </div>
            <strong>{agency || sellerName || t('agent.previewFallback')}</strong>
            <span>{t('common.brand')}</span>
          </div>

          <div className="prev-hero">
            {cover ? (
              <img src={cover.publicUrl ?? cover.url} alt={cover.alt?.trim() ?? ''} />
            ) : (
              <div className="prev-hero-empty">{t('editor.preview.noPhoto')}</div>
            )}
            <div className="prev-veil">
              {place && <div className="prev-place">{place}</div>}
              <div className="prev-title">{state.title || t('editor.preview.noTitle')}</div>
            </div>
          </div>

          <div className="prev-price-bar">
            <div className="prev-price">
              <bdi>{state.price > 0 ? ils(state.price) : '—'}</bdi>
            </div>
            {state.priceNote && <div className="prev-price-note">{state.priceNote}</div>}
          </div>

          {cells.length > 0 && (
            <div className="prev-facts">
              {cells.map((fact) => {
                const value = fact.present === false ? 'אין' : factValue(fact.value);
                return (
                  <div key={fact.key} className={fact.present === false ? 'prev-fact off' : 'prev-fact'}>
                    <div className="prev-fact-val">
                      {needsBdi(fact.value) ? <bdi>{value}</bdi> : value}
                      {fact.unit ? ` ${fact.unit}` : ''}
                    </div>
                    <div className="prev-fact-lbl">{fact.label}</div>
                  </div>
                );
              })}
            </div>
          )}

          {paragraphs.length > 0 && (
            <section className="prev-prose">
              <h2>{category === 'property' ? 'על הדירה' : 'על הרכב'}</h2>
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </section>
          )}

          {photos.length > 1 && (
            <div className="prev-gallery">
              {photos.slice(1, 5).map((photo) => (
                <img key={photo.id} src={photo.publicUrl ?? photo.url} alt={photo.alt?.trim() ?? ''} />
              ))}
            </div>
          )}

          <p className="prev-cta-label">{t('editor.preview.ctaMock')}</p>
          <div className="prev-cta" aria-hidden="true">
            {t('editor.preview.cta')}
          </div>
        </div>
      </div>

      <p className="field-hint preview-note">
        {t('editor.preview.note', { count: num(photos.length) })}
      </p>
    </>
  );
}
