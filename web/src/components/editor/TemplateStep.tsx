import type { CSSProperties } from 'react';

import { ACCENTS, type AccentId, isAccentId } from '@/features/agents/accents';
import { TEMPLATE_IDS, type TemplateId } from '@/types/listing';

import { t } from '../../lib/i18n';

interface Props {
  chosen?: TemplateId;
  onChoose: (template: TemplateId) => void;
  accent?: string | undefined;
  onAccent: (accent: AccentId) => void;
}

/**
 * Choosing how the page looks — template shape AND the agent's colour.
 *
 * The facsimile beside this step restyles from `data-template` and
 * `--accent`. These cards are the picker; that preview is the proof.
 */
export function TemplateStep({ chosen, onChoose, accent, onAccent }: Props) {
  const palette = isAccentId(accent) ? accent : 'olive';

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
      </fieldset>

      <p className="hint">{t('editor.templates.hint')}</p>

      <ul className="template-grid">
        {TEMPLATE_IDS.map((template) => (
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
                    <span />
                    <span />
                    <span />
                    <span />
                  </span>
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
