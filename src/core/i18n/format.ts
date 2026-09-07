/**
 * Bidi-safe formatters (CLAUDE.md §4.4).
 *
 * Hebrew is a right-to-left script, but numbers and Latin words inside it are
 * still read left-to-right. The Unicode bidi algorithm has to guess where each
 * run starts and ends, and it guesses badly around punctuation. These helpers
 * remove the guessing.
 */

/**
 * LEFT-TO-RIGHT MARK (U+200E).
 *
 * An invisible, zero-width character that tells the bidi algorithm "a
 * left-to-right run starts/ends here". Wrapping a value in it pins the value's
 * direction so surrounding Hebrew cannot drag parts of it around.
 */
const LRM = String.fromCharCode(0x200e);

/**
 * Pins a string to left-to-right order.
 *
 * Without this: a phone number like "054-1234567" placed in a Hebrew sentence
 * renders as "1234567-054" — the hyphen is direction-neutral, so the bidi
 * algorithm treats the two digit groups as separate runs and lays them out
 * right-to-left. Same problem with IDs, SKUs, version numbers and file names.
 */
export function ltr(value: string): string {
  return `${LRM}${value}${LRM}`;
}

/**
 * Formats an amount as Israeli shekels: 1290 -> "₪1,290".
 *
 * Without this: the shekel sign is direction-neutral, so "₪" next to Hebrew
 * text jumps to the wrong side of the number — "1,290₪" one moment and
 * "₪1,290" the next, depending on what happens to sit beside it. Prices that
 * move around the screen look like a bug to users, because they are one.
 *
 * Whole amounts print without decimals; fractional amounts keep up to two.
 */
export function ils(amount: number): string {
  const digits = new Intl.NumberFormat('he-IL', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

  return ltr(`₪${digits}`);
}

/**
 * Formats a date as dd/MM/yyyy — the format Israelis actually read.
 *
 * Without this: two things break. Intl's he-IL default uses dots (07.09.2026)
 * rather than slashes, and an unpinned date next to Hebrew text can render its
 * segments in reverse, turning 07/09/2026 into 2026/09/07. A date that reads
 * as the wrong day is worse than an ugly one.
 *
 * Built by hand rather than via Intl so the output is identical on Hermes,
 * on iOS, and in Jest — Intl's date output varies by platform ICU version.
 */
export function heDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return ltr(`${day}/${month}/${year}`);
}

/**
 * Formats a date and time as dd/MM/yyyy HH:mm, 24-hour.
 *
 * Without this: the colon in a time is direction-neutral, so "14:30" can flip
 * to "30:14" inside a Hebrew sentence. Israel uses a 24-hour clock, so no
 * AM/PM is emitted.
 */
export function heDateTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return ltr(`${heDate(date).replaceAll(LRM, '')} ${hours}:${minutes}`);
}

/**
 * Formats an Israeli phone number and pins it left-to-right.
 *
 * Without this: hyphens split the number into runs that the bidi algorithm
 * reorders, so "054-1234567" displays as "1234567-054". Users copy the wrong
 * number, or call it.
 *
 * Recognises local mobile (10 digits), local landline (9 digits) and +972
 * international form. Anything unrecognised is passed through untouched but
 * still direction-pinned — better an unformatted number than a mangled one.
 */
export function phone(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (/^0\d{9}$/.test(digits)) {
    return ltr(`${digits.slice(0, 3)}-${digits.slice(3)}`);
  }

  if (/^0\d{8}$/.test(digits)) {
    return ltr(`${digits.slice(0, 2)}-${digits.slice(2)}`);
  }

  if (/^972\d{9}$/.test(digits)) {
    return ltr(`+972-${digits.slice(3, 5)}-${digits.slice(5)}`);
  }

  return ltr(value.trim());
}
