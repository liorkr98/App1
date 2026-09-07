import { heDate, heDateTime, ils, ltr, phone } from '@/core/i18n/format';

/**
 * Fixtures for the kitchen-sink screen.
 *
 * These are NOT user-facing copy, so they deliberately live here rather than
 * in locales/ (CLAUDE.md §10 governs shipped strings). They are test data
 * chosen to break RTL layout: over-long Hebrew, Hebrew with embedded Latin,
 * and every value type §4.6 says a screen must be checked against.
 *
 * This whole directory is development-only and never renders in production.
 */

export const fixtures = {
  /** Long enough to wrap several times and expose truncation bugs. */
  longHebrew:
    'זוהי פסקה ארוכה בעברית שנועדה לבדוק גלישת שורות, גובה שורה, וריווח בין אותיות במצב ימין־לשמאל. אם הטקסט נראה צפוף או נחתך באמצע, משהו בטיפוגרפיה לא תקין וצריך לתקן אותו לפני שממשיכים.',

  /** Hebrew with Latin words embedded — the classic bidi failure case. */
  mixed: `האפליקציה נבנתה עם ${ltr('React Native')} ו־${ltr('Expo SDK 57')}, ומשתמשת ב־${ltr('Supabase')} לניהול הנתונים.`,

  /** A price. Must render as ₪1,290 with the sign on the left of the digits. */
  price: ils(1290),
  priceFractional: ils(79.9),

  /** A phone number. Must not reorder to 1234567-054. */
  mobile: phone('0541234567'),
  landline: phone('021234567'),
  international: phone('+972541234567'),

  /** Dates. Must read dd/MM/yyyy, not yyyy/MM/dd. */
  date: heDate(new Date(2026, 8, 7)),
  dateTime: heDateTime(new Date(2026, 8, 7, 14, 30)),

  /** Short strings for row titles. */
  rowTitle: 'הגדרות חשבון',
  rowSubtitle: 'ניהול פרטים אישיים והעדפות',
  truncating: 'כותרת ארוכה במיוחד שאמורה להיחתך בסוף השורה ולא לדחוף את שאר הרכיבים החוצה',
} as const;
