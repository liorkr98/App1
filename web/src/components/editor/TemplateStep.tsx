import { TEMPLATE_IDS, type TemplateId } from '@/types/listing';

import { t } from '../../lib/i18n';

interface Props {
  chosen?: TemplateId;
  onChoose: (template: TemplateId) => void;
}

/**
 * Choosing how the page looks.
 *
 * The copy says the data is identical in all five and only the appearance
 * changes. Each option is a miniature of that page, not a name and a note:
 * a seller who cannot tell משרד from סיור is a seller guessing. The notes
 * still say when NOT to pick a template (dark is wasted on poor photos).
 *
 * Driven from TEMPLATE_IDS rather than a list written out here, so a new
 * template appears by existing — and its two strings are then missing from
 * locales/he.json, which is visible rather than silent.
 */
export function TemplateStep({ chosen, onChoose }: Props) {
  return (
    <div className="template-step">
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
              <span className={`template-thumb thumb-${template}`} aria-hidden="true">
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
