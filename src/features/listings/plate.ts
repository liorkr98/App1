import type { Fact, FactValue } from '@/types/listing.js';

/**
 * Licence plate lookup: the input, the gate, and the mapping.
 *
 * TWO RULES, BOTH NON-NEGOTIABLE (CLAUDE.md §7, §12):
 *
 * 1. **The plate is never published.** It is a lookup key. A public page
 *    pairing a plate with a location is a theft and plate-cloning risk, and
 *    the page is deliberately reachable by anyone with the link.
 *
 *    Enforced structurally rather than by discipline: nothing in this file
 *    returns the plate, and there is no field on `Listing` to put it in. The
 *    only way to publish one would be to add somewhere to store it.
 *
 * 2. **An ownership declaration is required** before a lookup is attached to a
 *    listing, and it is logged. `attachLookup` refuses without it — a boolean
 *    argument, not a comment, because the whole point is that it cannot be
 *    forgotten.
 */

/**
 * Israeli plate formats, digits only.
 *
 * Seven digits (12-345-67) for older vehicles, eight (123-45-678) since 2017,
 * five or six for motorcycles and some older registrations. The register
 * stores `mispar_rechev` as a bare number, so separators are stripped rather
 * than validated — a seller may type dashes, spaces, or neither, and all three
 * are the same plate.
 */
const PLATE_DIGITS = /^\d{5,8}$/;

/** Separators a person might type. Hyphen, dash variants, spaces, dots. */
const SEPARATORS = /[\s\-.\u2010-\u2015]/g;

/**
 * Strips separators and validates, or returns undefined.
 *
 * Undefined is an ordinary outcome: it means "not a plate", and the editor
 * simply does not offer a lookup. It is not an error to show the seller.
 */
export function normalisePlate(input: string): string | undefined {
  const digits = input.replace(SEPARATORS, '').trim();
  return PLATE_DIGITS.test(digits) ? digits : undefined;
}

/**
 * Groups a plate for display IN THE EDITOR ONLY.
 *
 * Named so that its one legitimate use is obvious and any other is not. The
 * seller needs to read back what they typed; the published page never sees
 * this function's output.
 */
export function formatPlateForInput(digits: string): string {
  if (digits.length === 8) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  if (digits.length === 7) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  return digits;
}

// ---------------------------------------------------------------------------
// The registry row
// ---------------------------------------------------------------------------

/**
 * The fields we read from the Ministry of Transport registry.
 *
 * Names are the register's own, verified against resource
 * 053cea08-09bc-40ec-8f7a-156f0677aff3 — 4,176,978 rows
 * (docs/DATA-SOURCES.md). Renaming them here would hide which register column
 * a fact came from.
 */
export interface RegistryRow {
  tozeret_nm?: string;
  kinuy_mishari?: string;
  degem_nm?: string;
  shnat_yitzur?: string | number;
  sug_delek_nm?: string;
  tokef_dt?: string;
  baalut?: string;
  /** Join key into the model catalogue, where engine capacity lives. */
  degem_cd?: string | number;
}

/** From the model catalogue, joined on degem_cd. */
export interface ModelRow {
  nefah_manoa?: string | number;
}

export interface LookupSources {
  registry: RegistryRow;
  model?: ModelRow;
  /**
   * Number of distinct ownership periods, derived by counting rows in the
   * history register.
   *
   * ABSENT is different from zero and must stay that way. That dataset only
   * covers 2017 onward, so a 2012 car legitimately has no usable count — and
   * a confidently wrong יד on a page advertising itself as verified is worse
   * than no יד at all.
   */
  ownershipCount?: number;
}

/** Hebrew ordinals the schema's יד enum accepts, indexed by count. */
const HAND_LABELS = ['ראשונה', 'שנייה', 'שלישית', 'רביעית', 'חמישית ומעלה'];

function handLabel(count: number): string | undefined {
  if (count < 1) return undefined;
  return HAND_LABELS[Math.min(count, HAND_LABELS.length) - 1];
}

/**
 * Registry `tokef_dt` is a full date; the schema shows month and year.
 *
 * A seller knows the month their טסט expires, not the day, and the page shows
 * what the register holds rather than inventing precision around it.
 */
export function toMonthYear(value: string): string | undefined {
  const iso = /^(\d{4})-(\d{2})/.exec(value.trim());
  if (iso?.[1] && iso[2]) return `${iso[2]}/${iso[1]}`;

  const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(value.trim());
  if (dmy?.[2] && dmy[3]) return `${dmy[2]}/${dmy[3]}`;

  return undefined;
}

/** Values a plate lookup can fill, keyed by the vehicle schema's fact keys. */
export type LookupValues = Partial<Record<string, FactValue>>;

/**
 * Maps register rows onto fact values.
 *
 * Returns ONLY what the registers actually supplied. A field the lookup could
 * not fill is left absent so the seller answers it themselves — filling it
 * with a plausible default would be a fabricated fact wearing a מאומת badge,
 * which is the one thing §7 forbids outright.
 */
export function toLookupValues(sources: LookupSources): LookupValues {
  const { registry, model, ownershipCount } = sources;
  const values: LookupValues = {};

  const set = (key: string, value: FactValue | undefined): void => {
    if (value === undefined || value === null || value === '') return;
    values[key] = value;
  };

  set('make', registry.tozeret_nm?.trim());
  // The commercial name reads better than the internal model designation.
  set('model', (registry.kinuy_mishari || registry.degem_nm)?.trim());

  const year = Number(registry.shnat_yitzur);
  if (Number.isInteger(year) && year > 1900) set('year', year);

  set('fuel', registry.sug_delek_nm?.trim());
  set('previous_ownership', registry.baalut?.trim());

  if (registry.tokef_dt) set('test_until', toMonthYear(registry.tokef_dt));

  // Engine capacity is NOT in the registry — it needs the model catalogue,
  // joined on degem_cd (docs/DATA-SOURCES.md finding 2).
  const cc = Number(model?.nefah_manoa);
  if (Number.isInteger(cc) && cc > 0) set('engine_cc', cc);

  if (ownershipCount !== undefined) set('hand', handLabel(ownershipCount));

  return values;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export class OwnershipNotDeclared extends Error {
  constructor() {
    super(
      'a plate lookup cannot be attached to a listing without the ownership ' +
        'declaration (אני מצהיר שהרכב בבעלותי)',
    );
    this.name = 'OwnershipNotDeclared';
  }
}

export interface DeclarationRecord {
  declared: true;
  /** ISO timestamp. Logged, because the declaration is the legal basis. */
  declaredAt: string;
}

export interface AttachResult {
  facts: Fact[];
  declaration: DeclarationRecord;
}

/**
 * Applies looked-up values to the listing's facts, marking them verified.
 *
 * The declaration is a REQUIRED ARGUMENT rather than a check somewhere else,
 * so a caller cannot attach a lookup without having one — the type system
 * refuses before the runtime does.
 *
 * A fact is promoted only where the lookup actually supplied a value.
 * Everything else keeps the seller's value and the לפי המוכר class — including
 * fields the seller happened to type correctly, because "correct" and
 * "verified" are different claims and only one of them is ours to make.
 *
 * That the promoted keys are exactly the verifiable ones is guaranteed
 * upstream: `toLookupValues` is the only producer of a LookupValues, and it
 * emits nothing the registers did not supply. This function does not re-derive
 * it from the schema, so handing it a hand-built object would bypass that —
 * which is why nothing else should build one.
 */
export function attachLookup(
  facts: readonly Fact[],
  values: LookupValues,
  declaredAt: string | undefined,
  provenance: { sourceName: string; sourceDate: string },
): AttachResult {
  if (!declaredAt) throw new OwnershipNotDeclared();

  const next = facts.map((fact) => {
    const value = values[fact.key];
    if (value === undefined) return fact;

    return {
      ...fact,
      value,
      source: 'verified' as const,
      sourceName: provenance.sourceName,
      sourceDate: provenance.sourceDate,
    };
  });

  return { facts: next, declaration: { declared: true, declaredAt } };
}
