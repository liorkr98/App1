import type { EditorState } from '@/features/listings/editor';

import { t } from '../../lib/i18n';

interface Props {
  state: EditorState;
  onChange: (patch: Partial<EditorState>) => void;
}

/**
 * Title, price, and where the thing is.
 *
 * These are the fields the WhatsApp card is cut from, and they were missing
 * from the editor for too long: drafts sat in the database titled nothing
 * and priced ₪0. The required ones — title and price — block leaving this
 * step. City and street do not, because a seller who will not give a street
 * is making a privacy choice, not abandoning the form.
 */
export function DetailsStep({ state, onChange }: Props) {
  return (
    <>
      <p className="hint">{t('editor.detailsHint')}</p>

      <div className="fact-row">
        <div className="fact-head">
          <label htmlFor="listing-title">{t('editor.titleLabel')}</label>
        </div>
        <input
          id="listing-title"
          name="title"
          value={state.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder={t('editor.titlePlaceholder')}
          autoComplete="off"
        />
      </div>

      <div className="fact-row">
        <div className="fact-head">
          <label htmlFor="listing-price">{t('editor.priceLabel')}</label>
        </div>
        <input
          id="listing-price"
          name="price"
          type="text"
          inputMode="numeric"
          dir="ltr"
          value={state.price > 0 ? String(state.price) : ''}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D+/g, '');
            onChange({ price: digits === '' ? 0 : Number(digits) });
          }}
          aria-describedby="price-hint"
        />
        <p id="price-hint" className="plate-note">
          {t('editor.priceHint')}
        </p>
      </div>

      <div className="fact-row">
        <div className="fact-head">
          <label htmlFor="listing-price-note">{t('editor.priceNoteLabel')}</label>
        </div>
        <input
          id="listing-price-note"
          name="priceNote"
          value={state.priceNote ?? ''}
          onChange={(event) => onChange({ priceNote: event.target.value })}
          placeholder={t('editor.priceNotePlaceholder')}
          autoComplete="off"
        />
      </div>

      <div className="fact-row">
        <div className="fact-head">
          <label htmlFor="listing-city">{t('editor.cityLabel')}</label>
        </div>
        <input
          id="listing-city"
          name="city"
          value={state.city ?? ''}
          onChange={(event) => onChange({ city: event.target.value })}
          autoComplete="address-level2"
        />
      </div>

      {state.category === 'property' ? (
        <div className="fact-row">
          <div className="fact-head">
            <label htmlFor="listing-street">{t('editor.streetLabel')}</label>
          </div>
          <input
            id="listing-street"
            name="street"
            value={state.street ?? ''}
            onChange={(event) => onChange({ street: event.target.value })}
            autoComplete="street-address"
            aria-describedby="street-hint"
          />
          <p id="street-hint" className="plate-note">
            {t('editor.streetHint')}
          </p>
        </div>
      ) : null}
    </>
  );
}
