import type { Seller } from '@/types/listing.js';

/**
 * The agent's own details, asked once and reused by every listing they make.
 *
 * WHY THIS IS A PROFILE AND NOT A STEP IN THE EDITOR.
 *
 * CLAUDE.md §1: a private seller does this once every seven years, an agent
 * does it every week. Asking an agent to retype their agency and phone on
 * every listing is the difference between a tool they keep and a form they
 * abandon — and it guarantees the twentieth listing disagrees with the first
 * about how the agency is spelled, which is exactly the inconsistency the
 * product sells the cure for.
 *
 * So it lives on `profiles` (migration 0009), is answered once, and is
 * stamped onto each listing's `seller` at draft time.
 *
 * THE STAMP IS A COPY, AND THAT IS DELIBERATE. `listings.seller` is jsonb, not
 * a foreign key. An agent who changes agency next year must not silently
 * rewrite the twelve pages they already sent — those pages are a record of
 * what was true when they were published, and a buyer who saved one is
 * entitled to see the same page tomorrow. Provenance applies to the seller
 * block too, not only to the facts grid.
 *
 * NOTHING HERE IS VERIFIED. The licence number is self-declared; the Justice
 * Ministry register lists 22,995 brokers and checking against it is real work
 * that has not been done. A page must never imply otherwise, which is why
 * `licenceNumber` never travels into `Seller` — see `toSeller`.
 */
export interface AgentProfile {
  /** The person's name, as it appears on the page. */
  displayName?: string | null;
  /** Whatever they typed. Normalised on the way out, never on the way in. */
  phone?: string | null;
  /** Absent for a private seller. Its presence is what shows an agency. */
  agencyName?: string | null;
  /** Hebrew role line, e.g. מתווך מורשה. */
  role?: string | null;
  /** Self-declared. NOT checked against the register. */
  licenceNumber?: string | null;
  /**
   * The accent every listing this agent creates is stamped with.
   *
   * Not a blocker: absent means olive, which is the brand, so an agent who
   * never opens the picker still gets a coherent page. See accents.ts.
   */
  accent?: string | null;
}

/**
 * Why a profile cannot brand a listing yet, as a code rather than a sentence.
 *
 * Same split as the editor's BLOCKER_CODES and for the same reason: the
 * Hebrew lives in locales/he.json (CLAUDE.md §12), and a rules module that
 * also carried its display strings would put the wording behind the rules.
 */
export const PROFILE_BLOCKER_CODES = ['nameMissing', 'phoneMissing', 'phoneInvalid'] as const;

/** An array first so the set can be iterated by the copy-completeness test. */
export type ProfileBlockerCode = (typeof PROFILE_BLOCKER_CODES)[number];

/**
 * Israeli phone numbers, reduced to what wa.me accepts.
 *
 * `CtaDock` wants "digits only, international format without a plus" —
 * 972500000000. An Israeli agent types none of those. They type 050-123-4567,
 * or 0501234567, or +972 50 123 4567, or 972-50-1234567, and every one of
 * those is the same phone.
 *
 * THIS IS THE ONE FIELD WHOSE ABSENCE BREAKS THE PAGE'S ONLY ACTION (0009).
 * A listing with no usable phone still renders — hero, facts, enrichment, all
 * of it — and its single button goes nowhere. So the normalisation happens
 * here, once, where it can be tested, rather than in the component that
 * happens to build the href.
 *
 * Returns undefined rather than a best guess. A wrong number is worse than a
 * missing one: a missing one blocks publishing and gets fixed, a wrong one
 * ships and sends every buyer to a stranger.
 */
export function normalisePhone(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;

  // Everything that is not a digit goes, including the leading +. Israeli
  // sellers write ־ (maqaf), plain hyphens, spaces, dots and brackets, and
  // none of them carry information.
  const digits = raw.replace(/\D+/g, '');
  if (digits === '') return undefined;

  // 00 is the other way of writing +, still current on older handsets.
  const international = digits.startsWith('00') ? digits.slice(2) : digits;

  let national: string;
  if (international.startsWith('972')) {
    national = international.slice(3);
    // +972 0 50 … — typed by people who add the country code without
    // dropping the trunk zero. Common enough to handle rather than reject.
    if (national.startsWith('0')) national = national.slice(1);
  } else if (international.startsWith('0')) {
    national = international.slice(1);
  } else {
    national = international;
  }

  // A mobile is 9 digits after the trunk zero (5X + 7). A landline is 8
  // (area code + 7). Anything else is not a number this page can dial, and
  // guessing which digit was mistyped is not this function's business.
  if (national.length !== 9 && national.length !== 8) return undefined;

  // Mobiles start 5, landlines 2/3/4/8/9, and 7 is the non-geographic range
  // that VoIP and ported numbers use. A leading 1 is a service code and is
  // never a person.
  if (!/^[2348957]/.test(national)) return undefined;

  return `972${national}`;
}

/**
 * Everything standing between this profile and a listing that can be sent.
 *
 * Returns ALL of them rather than the first, for the reason the editor's
 * `blockers` does: being told about one thing, fixing it, and immediately
 * being told about another is how a form on a phone gets abandoned.
 *
 * THE AGENCY NAME IS NOT REQUIRED. A private seller has none, and PRD §1 keeps
 * them a supported case — the page shows נבנה בסיבוב where an agency would
 * go. Requiring it would make the product agent-only rather than agent-first.
 */
export function profileBlockers(profile: AgentProfile): ProfileBlockerCode[] {
  const found: ProfileBlockerCode[] = [];

  if (!profile.displayName || profile.displayName.trim() === '') {
    found.push('nameMissing');
  }

  if (!profile.phone || profile.phone.trim() === '') {
    found.push('phoneMissing');
  } else if (normalisePhone(profile.phone) === undefined) {
    // A separate code from phoneMissing because the seller can act on only
    // one of them: "we need your number" and "that number cannot be dialled"
    // are different sentences and different fixes.
    found.push('phoneInvalid');
  }

  return found;
}

/** Whether this profile can brand a listing. */
export function isProfileComplete(profile: AgentProfile): boolean {
  return profileBlockers(profile).length === 0;
}

/** Whether the profile has been filled in at all. Drives the first-run prompt. */
export function isProfileEmpty(profile: AgentProfile): boolean {
  return (
    !profile.displayName?.trim() &&
    !profile.phone?.trim() &&
    !profile.agencyName?.trim() &&
    !profile.role?.trim()
  );
}

/**
 * The profile, as the listing will carry it.
 *
 * `role` falls back to the category's own wording — בעל הדירה / בעל הרכב — so
 * a private seller who never set one still gets a line that reads like a
 * person rather than a blank.
 *
 * THE LICENCE NUMBER IS NOT COPIED, and that is the point of the function
 * existing rather than the caller spreading the profile. It is self-declared
 * and unchecked (0009), so putting it on a public page next to verified
 * register data would borrow the credibility of the facts grid for a string
 * nobody validated. When it is checked against the Justice Ministry register
 * it can travel; until then it stays in the profile.
 *
 * Returns undefined when the profile cannot brand a listing, rather than a
 * half-filled Seller. A caller that has not checked `profileBlockers` should
 * not be able to stamp a page with a phone that does not dial.
 */
export function toSeller(
  profile: AgentProfile,
  fallbackRole: string,
): Seller | undefined {
  const phone = normalisePhone(profile.phone);
  const name = profile.displayName?.trim();
  if (!phone || !name) return undefined;

  const agencyName = profile.agencyName?.trim();
  const role = profile.role?.trim();

  return {
    name,
    phone,
    role: role !== '' && role !== undefined ? role : fallbackRole,
    // Omitted rather than set to an empty string: `Seller.agencyName` being
    // absent is what makes the agent bar show נבנה בסיבוב, and '' is truthy
    // enough in enough places to produce an agency bar with no agency in it.
    ...(agencyName ? { agencyName } : {}),
  };
}
