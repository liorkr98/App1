import type { CSSProperties } from 'react';

import { ACCENTS, type AccentId, isAccentId } from '@/features/agents/accents';
import type { ListingCategory } from '@/features/listings/schemas';
import { CATALOGUE, pickerTemplates, templateSpec } from '@/features/templates/manifest';
import type { SuggestReason } from '@/features/templates/suggest';
import type { TemplateId } from '@/types/listing';

import { t } from '../../lib/i18n';

interface Props {
  /** Showroom is offered for cars only (TEMPLATE_MANIFEST.categories). */
  category?: ListingCategory | undefined;
  chosen?: TemplateId;
  onChoose: (template: TemplateId) => void;
  accent?: string | undefined;
  onAccent: (accent: AccentId) => void;
  /** The seller's own photos, so the picker is the page not a grey slab. */
  photos?: readonly string[];
  /** "הבחירה של היעד" (features/templates/suggest), with its one-line why. */
  suggestion?: { id: TemplateId; reason: SuggestReason } | undefined;
  /** The current accent was chosen from the cover photo (cover-accent.ts). */
  accentFromCover?: boolean;
  /** What the cover suggests, offered as one tap when a brand colour holds. */
  coverTone?: AccentId | undefined;
  /** No aspect fact yet: Heliograph would render without its sun. */
  missingAspect?: boolean;
}

/**
 * Choosing how the page looks — template shape AND the agent's colour.
 *
 * The facsimile beside this step restyles from `data-template` and
 * `--accent`. These cards are the picker; that preview is the proof.
 */
export function TemplateStep({
  category,
  chosen,
  onChoose,
  accent,
  onAccent,
  photos = [],
  suggestion,
  accentFromCover = false,
  coverTone,
  missingAspect = false,
}: Props) {
  const palette = isAccentId(accent) ? accent : 'olive';
  // The catalogue of twelve for this category, the suggestion first. An old
  // listing's own 1.x template stays on offer under "classic", so opening it
  // never silently changes what its link shows (manifest.ts pickerTemplates).
  const offered = pickerTemplates(category ?? 'property', chosen);
  const featured = offered.filter((id) => CATALOGUE.includes(id));
  if (suggestion && featured.includes(suggestion.id)) {
    featured.splice(0, featured.length, suggestion.id, ...featured.filter((id) => id !== suggestion.id));
  }
  const classic = offered.filter((id) => !featured.includes(id));
  const cover = photos[0];
  const film = [0, 1, 2, 3].map((index) => photos[index]);

  const card = (template: TemplateId) => {
    const shot = templateSpec(template).ls !== undefined;
    return (
      <li key={template}>
        <button
          type="button"
          className={template === chosen ? 'template-card chosen' : 'template-card'}
          aria-pressed={template === chosen}
          onClick={() => onChoose(template)}
        >
          <span
            className={shot ? `template-thumb is-shot thumb-${template}` : `template-thumb thumb-${template}`}
            data-template={template}
            aria-hidden="true"
            style={{ ['--accent']: ACCENTS.find((item) => item.id === palette)?.base } as CSSProperties}
          >
            {shot ? (
              <img className="thumb-shot" src={`/home/templates/${template}.webp`} alt="" />
            ) : template === 'walkFirst' ? (
              <span className="thumb-film">
                {film.map((src, index) =>
                  src ? <img key={`${src}-${index}`} src={src} alt="" /> : <span key={index} />,
                )}
              </span>
            ) : cover ? (
              <img className="thumb-hero-photo" src={cover} alt="" />
            ) : (
              <span className="thumb-hero" />
            )}
            {shot ? null : (
              <>
                <span className="thumb-price" />
                <span className="thumb-facts">
                  <span />
                  <span />
                  <span />
                </span>
              </>
            )}
          </span>
          <span className="choice-name">{t(`editor.templates.${template}`)}</span>
          <span className="choice-note">{t(`editor.templates.${template}Note`)}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="template-step">
      <fieldset className="palette-picker">
        <legend>{t('editor.templates.palette')}</legend>
        <p className="hint">{t('editor.templates.paletteHint')}</p>
        <div className="palette-row">
          {ACCENTS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === palette ? 'palette-chip chosen' : 'palette-chip'}
              aria-pressed={option.id === palette}
              aria-label={t(`agent.accents.${option.id}`)}
              style={{ ['--chip']: option.base } as CSSProperties}
              onClick={() => onAccent(option.id)}
            >
              <span className="palette-dot" aria-hidden="true" />
              <span>{t(`agent.accents.${option.id}`)}</span>
            </button>
          ))}
        </div>
        {accentFromCover ? (
          <p className="hint palette-note">{t('editor.templates.paletteFromCover')}</p>
        ) : coverTone && coverTone !== palette ? (
          <button type="button" className="palette-cover" onClick={() => onAccent(coverTone)}>
            {t('editor.templates.paletteUseCover', { name: t(`agent.accents.${coverTone}`) })}
          </button>
        ) : null}
      </fieldset>

      {suggestion ? (
        <button
          type="button"
          className={suggestion.id === chosen ? 'magic-pick chosen' : 'magic-pick'}
          aria-pressed={suggestion.id === chosen}
          onClick={() => onChoose(suggestion.id)}
        >
          <span className="magic-mark" aria-hidden="true">✦</span>
          <span className="magic-text">
            <b>
              {t('editor.magic.title')} · {t(`editor.templates.${suggestion.id}`)}
            </b>
            <span>{t(`editor.magic.${suggestion.reason}`)}</span>
          </span>
        </button>
      ) : null}

      <p className="hint">{t('editor.templates.hint')}</p>

      {chosen === 'heliograph' && missingAspect ? (
        <p className="review-flag" role="status">
          {t('editor.templates.needsAspect')}
        </p>
      ) : null}

      <h2 className="template-group">{t('editor.templates.groupNew')}</h2>
      <ul className="template-grid">{featured.map(card)}</ul>

      {classic.length > 0 ? (
        <>
          <h2 className="template-group">{t('editor.templates.groupClassic')}</h2>
          <ul className="template-grid">{classic.map(card)}</ul>
        </>
      ) : null}
    </div>
  );
}
