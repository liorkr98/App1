import type { CategorySchema } from '@/types/listing';

/**
 * Vehicle fact schema (PRD.md §2).
 *
 * Same rules as the property schema: labels are display strings, order is
 * display order, three fields required and no more.
 *
 * The order follows how a buyer scans a car listing — what it is, how old,
 * how used — rather than how a registration document is laid out.
 */
export const vehicleSchema: CategorySchema = {
  category: 'vehicle',
  facts: [
    { key: 'make', label: 'יצרן', type: 'text', required: true },
    { key: 'model', label: 'דגם', type: 'text', required: true },
    { key: 'year', label: 'שנתון', type: 'number', required: true },
    {
      key: 'hand',
      label: 'יד',
      type: 'enum',
      options: ['ראשונה', 'שנייה', 'שלישית', 'רביעית', 'חמישית ומעלה'],
    },
    { key: 'mileage', label: 'קילומטראז׳', type: 'number', unit: 'ק״מ' },
    {
      key: 'gearbox',
      label: 'תיבת הילוכים',
      type: 'enum',
      options: ['אוטומטית', 'ידנית', 'רובוטית', 'טיפטרוניק'],
    },
    { key: 'engine_cc', label: 'נפח מנוע', type: 'number', unit: 'סמ״ק' },
    {
      key: 'fuel',
      label: 'סוג דלק',
      type: 'enum',
      options: ['בנזין', 'דיזל', 'היברידי', 'חשמלי', 'גז'],
    },
    { key: 'color', label: 'צבע', type: 'text' },
    { key: 'test_until', label: 'טסט עד', type: 'date' },
    {
      key: 'previous_ownership',
      label: 'בעלות קודמת',
      type: 'enum',
      options: ['פרטית', 'חברה', 'ליסינג', 'השכרה', 'מונית', 'לימוד נהיגה'],
    },
    { key: 'owners_count', label: 'מספר בעלים', type: 'number' },
  ],
};
