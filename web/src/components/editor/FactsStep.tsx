import { answer, clear, markAbsent } from '@/features/listings/fact-entry';
import { factDefinition, type ListingCategory } from '@/features/listings/schemas';
import type { Fact } from '@/types/listing';

import { t } from '../../lib/i18n';

interface Props {
  category: ListingCategory;
  facts: readonly Fact[];
  onChange: (facts: Fact[]) => void;
}

/**
 * The facts step: the seller answering their category's schema.
 *
 * Only three fields per category are required (PRD §2). Everything else may
 * be left alone, and the copy above the list says so — a form that looks
 * obligatory is a form people abandon, and the page omits what nobody
 * answered rather than showing a gap.
 *
 * The אין control is the part worth understanding. Leaving a field blank and
 * marking it absent are DIFFERENT answers: blank is omitted from the page,
 * absent renders greyed with the word אין. "No parking" is information a
 * buyer wants; "we never asked" is not, and pretending the second is the
 * first is what makes a listing read like an advertisement.
 *
 * Required fields have no אין control. A flat with no rooms is not a listing.
 */
export function FactsStep({ category, facts, onChange }: Props) {
  return (
    <>
      <p className="hint">{t('editor.factsHint')}</p>

      <ul className="facts-entry">
        {facts.map((fact) => (
          <li key={fact.key} className={fact.present ? 'fact-row' : 'fact-row absent'}>
            <div className="fact-head">
              <label htmlFor={`fact-${fact.key}`}>
                {fact.label}
                {fact.unit ? <span className="fact-unit"> ({fact.unit})</span> : null}
              </label>

              {fact.required ? (
                <span className="fact-required">{t('editor.required')}</span>
              ) : (
                <button
                  type="button"
                  className="fact-absent"
                  aria-pressed={!fact.present}
                  onClick={() =>
                    onChange(
                      fact.present
                        ? markAbsent(facts, fact.key)
                        : clear(facts, fact.key),
                    )
                  }
                >
                  {fact.present ? t('editor.absent') : t('editor.notAnswered')}
                </button>
              )}
            </div>

            {fact.present ? (
              <Control
                category={category}
                fact={fact}
                onAnswer={(value) => onChange(answer(facts, fact.key, value))}
                onClear={() => onChange(clear(facts, fact.key))}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

interface ControlProps {
  category: ListingCategory;
  fact: Fact;
  onAnswer: (value: string | number | boolean) => void;
  onClear: () => void;
}

function Control({ category, fact, onAnswer, onClear }: ControlProps) {
  const id = `fact-${fact.key}`;
  const options = factDefinition(category, fact.key)?.options;

  if (fact.type === 'boolean') {
    // Two buttons rather than a checkbox. An unchecked checkbox cannot say
    // whether the seller answered "no" or never looked at the field, and that
    // is exactly the distinction the page depends on.
    return (
      <div className="fact-toggle">
        <button
          type="button"
          aria-pressed={fact.value === true}
          onClick={() => (fact.value === true ? onClear() : onAnswer(true))}
        >
          {t('common.yes')}
        </button>
        <button
          type="button"
          aria-pressed={fact.value === false}
          onClick={() => (fact.value === false ? onClear() : onAnswer(false))}
        >
          {t('common.no')}
        </button>
      </div>
    );
  }

  if (fact.type === 'enum' || (fact.type === 'date' && options)) {
    // entry_date accepts a real date OR מיידי / גמיש, so a date field with
    // options gets both controls: sellers frequently have no firm date, and
    // forcing one produces a made-up answer.
    return (
      <>
        <select
          id={id}
          value={typeof fact.value === 'string' ? fact.value : ''}
          onChange={(event) =>
            event.target.value === '' ? onClear() : onAnswer(event.target.value)
          }
        >
          <option value="">—</option>
          {options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        {fact.type === 'date' ? (
          <input
            type="date"
            aria-label={fact.label}
            value={isIsoDate(fact.value) ? fact.value : ''}
            onChange={(event) =>
              event.target.value === '' ? onClear() : onAnswer(event.target.value)
            }
          />
        ) : null}
      </>
    );
  }

  if (fact.type === 'number') {
    return (
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={typeof fact.value === 'number' ? String(fact.value) : ''}
        onChange={(event) => {
          // Number('') is 0, and 0 is a legitimate answer for a balcony. An
          // empty field means unanswered and has to be checked before the
          // conversion, not after it.
          const raw = event.target.value;
          if (raw === '') return onClear();

          const value = Number(raw);
          return Number.isFinite(value) ? onAnswer(value) : onClear();
        }}
      />
    );
  }

  return (
    <input
      id={id}
      type={fact.type === 'date' ? 'date' : 'text'}
      value={typeof fact.value === 'string' ? fact.value : ''}
      onChange={(event) =>
        event.target.value === '' ? onClear() : onAnswer(event.target.value)
      }
    />
  );
}

/** YYYY-MM-DD, which is what <input type="date"> both emits and accepts. */
function isIsoDate(value: Fact['value']): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
