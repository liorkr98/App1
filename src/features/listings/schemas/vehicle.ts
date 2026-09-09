import type { CategorySchema } from '@/types/listing.js';

/**
 * Vehicle fact schema (PRD.md §2).
 *
 * The `source` column is the point of this product, not a detail.
 *
 * Eight of these twelve fields can be filled from a licence plate against the
 * Ministry of Transport registers (RESEARCH.md §4.3): make, model, year,
 * engine capacity, fuel, hand, prior ownership type, test validity. The other
 * four — mileage, gearbox, colour, condition — nobody can check, so the seller
 * says them and the page says so.
 *
 * An Israeli used-car buyer distrusts every number in a listing, with reason.
 * Being able to see at a glance which four of the twelve are the seller's word
 * is the whole trust proposition, and it is something Yad2 does not offer.
 *
 * ORDER IS DISPLAY ORDER, and it is verified-first on purpose: the reader
 * meets the state's numbers before the seller's.
 */
export const vehicleSchema: CategorySchema = {
  category: 'vehicle',
  label: 'רכב',
  facts: [
    // Both appear in the hero title, so they are not repeated as grid cells.
    {
      key: 'make',
      label: 'יצרן',
      type: 'text',
      required: true,
      showInGrid: false,
      source: 'verified',
    },
    {
      key: 'model',
      label: 'דגם',
      type: 'text',
      required: true,
      showInGrid: false,
      source: 'verified',
    },
    { key: 'year', label: 'שנתון', type: 'number', required: true, source: 'verified' },
    {
      key: 'engine_cc',
      label: 'נפח מנוע',
      type: 'number',
      unit: 'סמ״ק',
      gridLabel: 'סמ״ק',
      source: 'verified',
    },
    {
      key: 'fuel',
      label: 'סוג דלק',
      type: 'enum',
      options: ['בנזין', 'דיזל', 'היברידי', 'חשמלי', 'גז'],
      source: 'verified',
    },
    {
      key: 'hand',
      label: 'יד',
      type: 'enum',
      options: ['ראשונה', 'שנייה', 'שלישית', 'רביעית', 'חמישית ומעלה'],
      source: 'verified',
    },
    {
      key: 'previous_ownership',
      label: 'בעלות קודמת',
      type: 'enum',
      options: ['פרטית', 'חברה', 'ליסינג', 'השכרה', 'מונית', 'לימוד נהיגה'],
      source: 'verified',
    },
    { key: 'test_until', label: 'טסט עד', type: 'date', source: 'verified' },

    // --- Seller-declared from here down ---------------------------------
    { key: 'mileage', label: 'קילומטראז׳', type: 'number', unit: 'ק״מ', gridLabel: 'ק״מ' },
    {
      key: 'gearbox',
      label: 'תיבת הילוכים',
      type: 'enum',
      options: ['אוטומטית', 'ידנית', 'רובוטית', 'טיפטרוניק'],
    },
    { key: 'color', label: 'צבע', type: 'text' },
    {
      key: 'condition',
      label: 'מצב הרכב',
      type: 'enum',
      options: ['מצוין', 'טוב', 'סביר', 'דורש טיפול'],
    },
  ],
};
