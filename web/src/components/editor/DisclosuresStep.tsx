import { useState } from 'react';

import { t } from '../../lib/i18n';

interface Props {
  items: readonly string[];
  onChange: (items: string[]) => void;
}

/**
 * "מה שכדאי לדעת" — free-text disclosures, entered here for the first time.
 *
 * `Disclosures.astro` has rendered any non-empty list since it was built,
 * for either category (its own comment says so), but nothing in the editor
 * ever produced one — the only listings that ever carried a disclosure were
 * the hand-authored sample fixtures. docs/OPPORTUNITIES.md §1c calls this out
 * for property specifically, against the Real Estate Brokers Regulations
 * (2024)'s duty to disclose defects and legal issues, but the gap was never
 * category-shaped: a vehicle seller had no way to type one either.
 *
 * OPTIONAL AND UNCAPPED IN COUNT, deliberately: PRD §2 keeps required fields
 * to three per category, and a disclosure list is the opposite of required —
 * it is a seller volunteering something nobody can ask them for. The count
 * these actually need is whatever is true, not a number this file guesses.
 */
export function DisclosuresStep({ items, onChange }: Props) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const text = draft.trim();
    if (text === '') return;
    onChange([...items, text]);
    setDraft('');
  };

  const remove = (index: number) => {
    onChange(items.filter((_, at) => at !== index));
  };

  return (
    <>
      <p className="hint">{t('editor.disclosuresHint')}</p>

      {items.length > 0 && (
        <ul className="disclosures-list">
          {items.map((item, index) => (
            // Index as key is safe here: items are never reordered, only
            // appended and removed, and two identical disclosures (the same
            // scratch mentioned twice) are a real case the seller might want.
            <li key={index} className="disclosures-item">
              <span>{item}</span>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={t('editor.disclosuresRemove')}
              >
                {t('editor.disclosuresRemove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="fact-row">
        <div className="fact-head">
          <label htmlFor="disclosure-input">{t('editor.disclosuresLabel')}</label>
        </div>
        <input
          id="disclosure-input"
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds the item rather than submitting the surrounding
            // form — a seller typing several disclosures in a row should
            // not have the flow jump to the next step on the first one.
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          placeholder={t('editor.disclosuresPlaceholder')}
        />
      </div>

      <button
        type="button"
        className="disclosures-add"
        onClick={add}
        disabled={draft.trim() === ''}
      >
        {t('editor.disclosuresAdd')}
      </button>
    </>
  );
}
