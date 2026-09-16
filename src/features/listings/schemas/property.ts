import type { CategorySchema } from '@/types/listing.js';

/**
 * Property fact schema (PRD.md §2).
 *
 * `label` is the display string, not a translation key. The app is Hebrew
 * only, so these strings live here rather than in locales/ — a fact schema is
 * data, and routing it through i18n would add a lookup that never varies.
 *
 * Order is display order, and it is the order a seller expects to be asked:
 * size first, then the features buyers filter on, then costs, then dates.
 *
 * Three fields are required. Everything else is optional and the form must
 * never block on it — a half-filled listing that ships beats a complete one
 * the seller abandoned.
 */
export const propertySchema: CategorySchema = {
  category: 'property',
  label: 'דירה',
  ownerRole: 'בעל הדירה',

  /*
   * Area first, because price per m² is the number an investor compares
   * between listings and this is its denominator. Then the two running costs
   * that decide what the yield actually is — they sit near the bottom of the
   * schema for a resident, who reads them last if at all.
   */
  investorLead: ['area_sqm', 'property_tax', 'building_fee'],
  facts: [
    { key: 'rooms', label: 'חדרים', type: 'number', required: true, phrase: '{value} חדרים' },
    {
      key: 'area_sqm',
      label: 'מ״ר',
      type: 'number',
      required: true,
      priceDenominator: true,
      phrase: '{value} מ״ר',
    },
    // Rendered as one cell, "3 / 5", under קומה — matching the reference page.
    {
      key: 'floor',
      label: 'קומה',
      type: 'number',
      pairWith: 'total_floors',
      phrase: 'קומה {value}',
    },
    { key: 'total_floors', label: 'מתוך קומות', type: 'number' },
    { key: 'elevator', label: 'מעלית', type: 'boolean', phrase: 'מעלית' },
    { key: 'parking', label: 'חניה', type: 'boolean', phrase: 'חניה' },
    { key: 'shelter', label: 'ממ״ד', type: 'boolean', phrase: 'ממ״ד' },
    {
      key: 'balcony_sqm',
      label: 'מרפסת שמש',
      type: 'number',
      unit: 'מ״ר',
      phrase: 'מרפסת שמש {value} מ״ר',
    },
    {
      key: 'aspect',
      label: 'כיווני אוויר',
      type: 'enum',
      options: [
        'צפון',
        'דרום',
        'מזרח',
        'מערב',
        'צפון־מזרח',
        'צפון־מערב',
        'דרום־מזרח',
        'דרום־מערב',
      ],
      phrase: 'כיווני אוויר {value}',
    },
    { key: 'storage', label: 'מחסן', type: 'boolean', phrase: 'מחסן' },
    {
      key: 'condition',
      label: 'מצב הנכס',
      type: 'enum',
      options: ['חדש מקבלן', 'משופץ', 'שמור', 'דורש שיפוץ'],
      phrase: 'הנכס {value}',
    },
    { key: 'property_tax', label: 'ארנונה', type: 'number', unit: '₪ לחודשיים' },
    { key: 'building_fee', label: 'ועד בית', type: 'number', unit: '₪ לחודש' },
    {
      key: 'entry_date',
      label: 'תאריך כניסה',
      type: 'date',
      // Accepts a date OR one of these. Sellers frequently do not have a firm
      // date, and forcing one produces a made-up answer.
      options: ['מיידי', 'גמיש'],
      phrase: 'כניסה {value}',
    },
  ],
};
