/**
 * The words and numbers two of the round-three first screens draw
 * (12 Oct 2026). Pure, so the rules are tested where they are written.
 */

/** Street types a Hebrew street name can already start with. */
const STREET_TYPES = /^(?:רחוב|רח['׳]|שדרות|שד['׳]|דרך|סמטת|סמ['׳]|כיכר|ככר|מעלה|משעול|שביל)(?:\s|$)/u;

/**
 * What the Street sign plate says: "רחוב דיזנגוף", but "שדרות רוטשילד" as
 * it is, never "רחוב שדרות …". The street is already public (publicStreet
 * removed any house number where the row became a listing); without one,
 * the plate carries the city.
 */
export function plateName(street: string | undefined, city: string, prefix = 'רחוב'): string {
  const name = (street ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return city.trim();
  return STREET_TYPES.test(name) ? name : `${prefix} ${name}`;
}

/** A gauge's needle position, 0 to 1. Unknown or negative reads as empty. */
export function gaugeFraction(value: number | null | undefined, full: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || full <= 0) return 0;
  return Math.min(1, value / full);
}

/** The full scale of the Dashboard's km gauge: 300,000 km. */
export const GAUGE_FULL_KM = 300_000;

/**
 * An odometer's wheels: the km as digits, padded to six wheels like a real
 * one, never more than seven. Unknown gives no wheels.
 */
export function odometerDigits(km: number | null | undefined): number[] {
  if (typeof km !== 'number' || !Number.isFinite(km) || km < 0) return [];
  const whole = Math.min(9_999_999, Math.round(km));
  return String(whole).padStart(6, '0').split('').map(Number);
}
