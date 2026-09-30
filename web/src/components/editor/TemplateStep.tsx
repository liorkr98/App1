import type { CSSProperties } from 'react';

import { ACCENTS, type AccentId, isAccentId } from '@/features/agents/accents';
import type { ListingCategory } from '@/features/listings/schemas';
import { templateFits } from '@/features/templates/manifest';
import type { SuggestReason } from '@/features/templates/suggest';
import { TEMPLATE_IDS, type TemplateId } from '@/types/listing';

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
}: Props) {
  const palette = isAccentId(accent) ? accent : 'olive';
  // Every template when the category is not chosen yet; otherwise only those
  // drawn for it. Still enumerated from TEMPLATE_IDS, never a second list.
  const offered = category ? TEMPLATE_IDS.filter((id) => templateFits(id, category)) : TEMPLATE_IDS;
  const cover = photos[0];
  const film = [0, 1, 2, 3].map((index) => photos[index]);

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

      <ul className="template-grid">
        {offered.map((template) => (
          <li key={template}>
            <button
              type="button"
              className={template === chosen ? 'template-card chosen' : 'template-card'}
              aria-pressed={template === chosen}
              onClick={() => onChoose(template)}
            >
              <span
                className={`template-thumb thumb-${template}`}
                data-template={template}
                aria-hidden="true"
                style={{ ['--accent']: ACCENTS.find((item) => item.id === palette)?.base } as CSSProperties}
              >
                {template === 'walkFirst' ? (
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
                <span className="thumb-price" />
                <span className="thumb-facts">
                  <span />
                  <span />
                  <span />
                </span>
              </span>
              <span className="choice-name">{t(`editor.templates.${template}`)}</span>
              <span className="choice-note">{t(`editor.templates.${template}Note`)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
