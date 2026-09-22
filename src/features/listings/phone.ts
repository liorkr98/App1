/**
 * Phone numbers on the listing page.
 *
 * The row stores E.164 without a plus (97250…). The page needs two shapes:
 * a `tel:` href the device can dial, and a local display string inside <bdi>.
 * Never publish a plate; a phone is contact, not a lookup key.
 */

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

function nationalDigits(phone: string): string {
  const digits = digitsOnly(phone);
  if (digits.startsWith('972')) return `0${digits.slice(3)}`;
  if (digits.startsWith('0')) return digits;
  return digits;
}

/** `tel:+972…` so a tap opens the dialer. Empty input → empty href. */
export function telHref(phone: string): string {
  const digits = digitsOnly(phone);
  if (!digits) return '';
  if (digits.startsWith('972')) return `tel:+${digits}`;
  if (digits.startsWith('0')) return `tel:+972${digits.slice(1)}`;
  return `tel:+${digits}`;
}

/**
 * Local Israeli grouping, e.g. 052-111-0001.
 *
 * Ten-digit mobiles (05x) and nine-digit landlines (0x) are the two shapes
 * the page actually sees. Anything else is returned as the national digits
 * so a foreign number is not silently regrouped.
 */
export function displayPhone(phone: string): string {
  const local = nationalDigits(phone);
  if (local.length === 10) return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
  if (local.length === 9) return `${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5)}`;
  return local;
}
