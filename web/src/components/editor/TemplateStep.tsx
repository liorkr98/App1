import { TEMPLATE_IDS, type TemplateId } from '@/types/listing';

import { t } from '../../lib/i18n';

interface Props {
  chosen?: TemplateId;
  onChoose: (template: TemplateId) => void;
}

/**
 * Choosing how the page looks.
 *
 * The copy says outright that the data is identical in all three and only the
 * appearance changes. That sentence is there to stop a seller believing a
 * template makes their listing better — the enrichment is what does that, and
 * a seller hunting for the "best" template is a seller not adding photos.
 *
 * Each option states when NOT to pick it. "Emphasises photos — only worth it
 * if the photos are good" is more use than three names that all sound
 * appealing, and it is honest about a template that will make a bad set of
 * photographs worse.
 *
 * Driven from TEMPLATE_IDS rather than a list written out here, so a fourth
 * template appears by existing — and its two strings are then missing from
 * locales/he.json, which is visible rather than silent.
 */
export function TemplateStep({ chosen, onChoose }: Props) {
  return (
    <>
      <p className="hint">{t('editor.templates.hint')}</p>

      <ul className="choices">
        {TEMPLATE_IDS.map((template) => (
          <li key={template}>
            <button
              type="button"
              className={template === chosen ? 'choice chosen' : 'choice'}
              aria-pressed={template === chosen}
              onClick={() => onChoose(template)}
            >
              <span className="choice-name">{t(`editor.templates.${template}`)}</span>
              <span className="choice-note">{t(`editor.templates.${template}Note`)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
