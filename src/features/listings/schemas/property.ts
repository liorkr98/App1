import type { CategorySchema } from '@/types/listing';

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
  facts: [
    { key: 'rooms', label: 'חדרים', type: 'number', required: true },
    { key: 'area_sqm', label: 'מ״ר', type: 'number', required: true },
    { key: 'floor', label: 'קומה', type: 'number' },
    { key: 'total_floors', label: 'מתוך קומות', type: 'number' },
    { key: 'elevator', label: 'מעלית', type: 'boolean' },
    { key: 'parking', label: 'חניה', type: 'boolean' },
    { key: 'shelter', label: 'ממ״ד', type: 'boolean' },
    { key: 'balcony_sqm', label: 'מרפסת שמש', type: 'number', unit: 'מ״ר' },
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
    },
    { key: 'storage', label: 'מחסן', type: 'boolean' },
    {
      key: 'condition',
      label: 'מצב הנכס',
      type: 'enum',
      options: ['חדש מקבלן', 'משופץ', 'שמור', 'דורש שיפוץ'],
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
    },
  ],
};
