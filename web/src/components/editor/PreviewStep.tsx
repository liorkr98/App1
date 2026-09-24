import type { CSSProperties } from 'react';

import { accentFor } from '@/features/agents/accents';
import type { EditorState } from '@/features/listings/editor';
import { groupByRoom, hasRoomLabels, isWalkItem, labeledWalkItems, type PhotoRoom } from '@/features/listings/photo-rooms';
import { factDefinition, factShown, schemaFor } from '@/features/listings/schemas';
import { factsFromSchema, type Fact } from '@/types/listing';

import { factValue, ils, needsBdi } from '../../lib/format';
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
 * WHY IT IS NOT AN IFRAME OF THE REAL PAGE. A draft has no public URL: the
 * read policy in 0002 exposes only 'published' and 'sold', so /a/[slug] is a
 * 404 for a draft by design. This renders the same chrome the listing page
 * uses — agent-bar, hero, price-bar, facts, walk, gallery — from the editor's
 * own state, so a logo cannot sit behind a photograph and a 340px toy phone
 * cannot invent a different layout from the one the buyer gets.
 *
 * Hero height is a fitted block, not 84svh of the editor window: that is what
 * used to swallow the agent bar.
 */
export function PreviewStep({ state, photos, agency, sellerName, accent, agencyLogoUrl }: Props) {
  const category = state.category ?? 'property';
  const schema = schemaFor(category);
  const palette = accentFor(accent);

  const cover = photos.find((photo) => photo.publicUrl ?? photo.url);
  const place = [state.street, state.city].filter(Boolean).join(', ');
  const titleLines = (state.title || t('editor.preview.noTitle')).split('\n');

  const byKey = new Map(state.facts.map((fact) => [fact.key, fact]));
  const cells = factsFromSchema(schema)
    .map((blank): Fact => byKey.get(blank.key) ?? blank)
    .filter((fact) => factShown(factDefinition(category, fact.key), state.audience, state.facts))
    .filter((fact) => fact.present === false || (fact.value !== null && fact.value !== ''));

  const paragraphs = state.description.split('\n\n').filter((line) => line.trim() !== '');
  const gallery = photos.slice(1).filter((photo) => !isWalkItem(photo, labeledWalkItems(photos)));
  const walkGroups = hasRoomLabels(photos)
    ? groupByRoom(photos).filter((group) => group.room)
    : [];
  const walkSlides = labeledWalkItems(photos)
    .filter((photo): photo is EditorPhoto & { room: PhotoRoom } =>
      Boolean(photo.room) && Boolean(photo.publicUrl ?? photo.url),
    )
    .map((photo) => ({ photo, room: photo.room }));
  const firstWalkIndex = new Map<string, number>();
  walkSlides.forEach((slide, index) => {
    if (!firstWalkIndex.has(slide.room)) firstWalkIndex.set(slide.room, index);
  });
  const showAllHref = gallery.length > 0 ? '#listing-gallery' : undefined;

  return (
    <>
      <p className="hint">{t('editor.preview.hint')}</p>

      <div className="preview-frame">
        <div
          className="preview-page"
          data-template={state.template ?? 'editorial'}
          data-has-walk={walkSlides.length > 0 ? '1' : undefined}
          style={
            {
              ['--accent']: palette.base,
              ['--accent-lift']: palette.lift,
            } as CSSProperties
          }
        >
          <div className="agent-bar">
            <div className="dot" aria-hidden="true">
              {agencyLogoUrl ? <img src={agencyLogoUrl} alt="" /> : null}
            </div>
            <strong>{agency || sellerName || t('agent.previewFallback')}</strong>
            <span>{t('common.brand')}</span>
          </div>

          <header className="hero">
            {cover ? (
              <img
                className="hero-img"
                src={cover.publicUrl ?? cover.url}
                alt={cover.alt?.trim() ?? ''}
              />
            ) : (
              <div className="prev-hero-empty">{t('editor.preview.noPhoto')}</div>
            )}
            <div className="hero-veil">
              {place ? <div className="hero-place">{place}</div> : null}
              <p className="hero-title">
                {titleLines.map((line, index) => (
                  <span key={index}>
                    {index > 0 ? <br /> : null}
                    {line}
                  </span>
                ))}
              </p>
            </div>
          </header>

          {(state.price > 0 || state.priceNote) && (
          <div className="price-bar">
            {state.price > 0 ? (
              <div className="price">
                <bdi>{ils(state.price)}</bdi>
              </div>
            ) : null}
            {state.priceNote ? <div className="price-note label">{state.priceNote}</div> : null}
          </div>
          )}

          {cells.length > 0 && (
            <div className="facts">
              {cells.map((fact) => {
                const value = fact.present === false ? 'אין' : factValue(fact.value);
                return (
                  <div key={fact.key} className={fact.present === false ? 'fact off' : 'fact'}>
                    <div className="fact-val">
                      {needsBdi(fact.value) ? <bdi>{value}</bdi> : value}
                      {fact.unit ? ` ${fact.unit}` : ''}
                    </div>
                    <div className="fact-lbl">{fact.label}</div>
                  </div>
                );
              })}
            </div>
          )}

          {paragraphs.length > 0 && (
            <section>
              <h2>{category === 'property' ? 'על הדירה' : 'על הרכב'}</h2>
              {paragraphs.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </section>
          )}

          {walkSlides.length > 0 && (
            <section className="walk">
              <h2>{t('listing.walkTitle')}</h2>
              <div className="walk-viewer">
                <nav className="walk-film" aria-label={t('listing.filmstrip')}>
                  {walkSlides.map((slide, index) => (
                    <label
                      key={slide.photo.id}
                      htmlFor={`preview-walk-p${index}`}
                      aria-label={t(`editor.rooms.${slide.room}`)}
                    >
                      <input
                        className="walk-pick"
                        type="radio"
                        name="preview-walk"
                        id={`preview-walk-p${index}`}
                        defaultChecked={index === 0}
                      />
                      <img src={slide.photo.publicUrl ?? slide.photo.url} alt="" width={72} height={72} />
                    </label>
                  ))}
                </nav>
                <div className="walk-main">
                  {walkSlides.map((slide, index) => {
                    const next = (index + 1) % walkSlides.length;
                    return (
                      <figure key={slide.photo.id}>
                        <div className="walk-frame">
                          <img
                            src={slide.photo.publicUrl ?? slide.photo.url}
                            alt={slide.photo.alt?.trim() ?? ''}
                          />
                          <nav className="walk-chips" aria-label={t('listing.walkTitle')}>
                            {walkGroups.map((group) =>
                              group.room ? (
                                <label
                                  key={group.room}
                                  htmlFor={`preview-walk-p${firstWalkIndex.get(group.room) ?? 0}`}
                                >
                                  {t(`editor.rooms.${group.room}`)}
                                </label>
                              ) : null,
                            )}
                          </nav>
                          {showAllHref ? (
                            <a className="walk-all" href={showAllHref}>
                              {t('listing.showAllPhotos')}
                            </a>
                          ) : null}
                          {walkSlides.length > 1 ? (
                            <label className="walk-next" htmlFor={`preview-walk-p${next}`}>
                              {t('listing.nextPhoto')}
                            </label>
                          ) : null}
                        </div>
                        <figcaption>{t(`editor.rooms.${slide.room}`)}</figcaption>
                      </figure>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {gallery.length > 0 && (
            <div id="listing-gallery" className="gallery">
              {gallery.map((photo) => (
                <figure key={photo.id}>
                  <img src={photo.publicUrl ?? photo.url} alt={photo.alt?.trim() ?? ''} />
                  {photo.room ? <figcaption>{t(`editor.rooms.${photo.room}`)}</figcaption> : null}
                </figure>
              ))}
            </div>
          )}

          <p className="prev-cta-label">{t('editor.preview.ctaMock')}</p>
          <div className="prev-cta" aria-hidden="true">
            {t('editor.preview.cta')}
          </div>
        </div>
      </div>
    </>
  );
}
