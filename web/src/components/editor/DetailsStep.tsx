import type { ListingCategory } from '@/features/listings/schemas';

import { t } from '../../lib/i18n';

interface Props {
  category: ListingCategory;
  title: string;
  price: number;
  city: string;
  street: string;
  priceNote: string;
  onChange: (patch: {
    title?: string;
    price?: number;
    city?: string;
    street?: string;
    priceNote?: string;
  }) => void;
}

/**
 * What the listing is, what it costs, and where it is.
 *
 * THIS STEP DID NOT EXIST UNTIL 14 SEPTEMBER 2026, and its absence was the
 * single largest hole in the product. `listings` has NOT NULL `title` and
 * `price` columns; `createDraft` fills them with '' and 0 and nothing ever
 * updated them. An agent could walk the entire seven-step flow and the row in
 * the database stayed titled nothing, priced nothing, placed nowhere. The
 * dashboard card reading "—" and "₪0" was not a display bug — it was an
 * accurate report of an empty row.
 *
 * IT IS THE FIRST STEP AFTER CATEGORY, before photographs, for two reasons.
 * These are the only fields the row cannot be published without, so failing
 * early is cheaper than failing after twenty-five uploads. And an agent
 * already knows the price and the address when they start; they are looking
 * at the property.
 *
 * THE VEHICLE ASKS FOR AN AREA AND NOT AN ADDRESS. DESIGN-CONTRACT §5.4: a
 * public page pairing a car with a home address is a theft and plate-cloning
 * risk, so there is no street field for a vehicle and the city field asks for
 * a general area instead. The difference is in the LABEL and in what the page
 * renders, not in a second component.
 */
export function DetailsStep({
  category,
  title,
  price,
  city,
  street,
  priceNote,
  onChange,
}: Props) {
  const isProperty = category === 'property';

  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor="d-title">
          {t('editor.details.title')}
        </label>
        <input
          id="d-title"
          className="field-input"
          type="text"
          value={title}
          onChange={(event) => onChange({ title: event.target.value })}
          maxLength={90}
        />
        <p className="field-hint">{t('editor.details.titleHint')}</p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="d-price">
          {t('editor.details.price')}
        </label>
        {/*
          dir="ltr" on the input only. A price is a run of Latin digits; typed
          into an RTL field the caret jumps and the grouping lands on the wrong
          side. The LABEL stays RTL, because it is Hebrew (CLAUDE.md §4).

          inputMode numeric rather than type=number: a spinner on a 1,850,000
          shekel figure is useless, and Safari's number input silently drops
          what it cannot parse instead of showing the seller their own typing.
        */}
        <input
          id="d-price"
          className="field-input"
          type="text"
          inputMode="numeric"
          dir="ltr"
          value={price > 0 ? String(price) : ''}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D+/g, '');
            onChange({ price: digits === '' ? 0 : Number(digits) });
          }}
        />
      </div>

      <div className="field">
        <label className="field-label" htmlFor="d-price-note">
          {t('editor.details.priceNote')}
        </label>
        <input
          id="d-price-note"
          className="field-input"
          type="text"
          value={priceNote}
          onChange={(event) => onChange({ priceNote: event.target.value })}
          maxLength={40}
        />
        <p className="field-hint">{t('editor.details.priceNoteHint')}</p>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="d-city">
          {isProperty ? t('editor.details.city') : t('editor.details.vehicleArea')}
        </label>
        <input
          id="d-city"
          className="field-input"
          type="text"
          value={city}
          onChange={(event) => onChange({ city: event.target.value })}
          maxLength={40}
        />
        {!isProperty && <p className="field-hint">{t('editor.details.vehicleAreaHint')}</p>}
      </div>

      {/* No street for a vehicle, and it is not hidden by CSS — it is not
          rendered. A field that exists in the DOM is a field that can be
          filled by autofill and published by accident. */}
      {isProperty && (
        <div className="field">
          <label className="field-label" htmlFor="d-street">
            {t('editor.details.street')}
          </label>
          <input
            id="d-street"
            className="field-input"
            type="text"
            value={street}
            onChange={(event) => onChange({ street: event.target.value })}
            maxLength={60}
          />
          <p className="field-hint">{t('editor.details.streetHint')}</p>
        </div>
      )}
    </>
  );
}
