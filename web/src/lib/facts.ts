import { orderForAudience } from '@/features/listings/audience-order';
import { absenceIsStated } from '@/features/listings/fact-absence';
import type { Fact, ListingAudience } from '@/types/listing';
import { factDefinition, factShown, schemaFor, type ListingCategory } from '@/features/listings/schemas';

import { pairedCellText } from '@/features/listings/monthly-cost';
import { factValue, needsBdi } from './format';

/**
 * Turns a listing's facts into grid cells.
 *
 * Contains NO field names. Everything category-specific — order, labels, short
 * grid labels, which facts pair into one cell — comes from the schema, so a
 * third category needs no change here.
 */

export interface FactCell {
  key: string;
  label: string;
  /**
   * Already display-formatted, and WITHOUT its unit.
   *
   * There is no `unit` field any more: it is folded into `label` by
   * unitLabel(). The B2 reference puts the unit under the number and never
   * beside it — `95` under `מ״ר`, `12` under `מרפסת, מ״ר`. The previous port
   * appended it to the value instead, which rendered "1,600סמ״ק": no space,
   * and the same unit printed twice, once glued to the digits and once as the
   * label underneath.
   */
  value: string;

  /**
   * What the cell actually paints. For a paired floor this is `3 / 5` as one
   * string, so a single `<bdi>` can isolate the whole run. Two sibling `<bdi>`s
   * reorder to `5 / 3` in RTL (DESIGN-CONTRACT §7 case 2).
   */
  displayValue: string;
  /** Wrap displayValue in <bdi>. */
  bdi: boolean;
  /** Confirmed absent — renders in --absent, showing אין. */
  absent: boolean;
  /**
   * Numeric value to count up (M3). The formatted `displayValue` stays in the
   * HTML. m² only — never the price, never rooms, never a floor ratio.
   */
  countFrom?: number;

  /**
   * True when a public register supplied this value, so the cell can carry
   * the מאומת marker (RESEARCH.md §4.7).
   *
   * Only ever true alongside sourceName and sourceDate: a verified claim with
   * no citation is just a claim in a nicer font.
   */
  verified: boolean;
  sourceName?: string;
  sourceDate?: string;
}

/**
 * present:false  → a cell showing אין in --absent. The seller said no.
 * value:null     → NO cell at all. The seller never answered.
 *
 * Collapsing these would turn "we do not know" into "no", which is the
 * difference between an honest page and an ad.
 */
/**
 * The cell label, carrying its unit.
 *
 * `מרפסת שמש` + `מ״ר` becomes `מרפסת, מ״ר`; `מ״ר` + `מ״ר` stays `מ״ר`, because
 * a label that already IS the unit must not repeat it. The comma is the
 * reference's own — read out of listing-page-template.html, not invented.
 */
function unitLabel(label: string, unit: string | undefined): string {
  if (!unit || label === unit) return label;
  if (label.includes(unit)) return label;

  // The label is trimmed of a trailing unit-less noun so the pair reads as
  // one phrase: מרפסת שמש, מ״ר would be three words fighting for one line.
  const head = label.split(' ')[0] ?? label;
  return `${head}, ${unit}`;
}

export function toCells(
  category: ListingCategory,
  facts: readonly Fact[],
  audience: ListingAudience = 'resident',
): FactCell[] {
  const byKey = new Map(facts.map((fact) => [fact.key, fact]));

  // Facts consumed as the right-hand side of a pair are not rendered alone.
  const paired = new Set<string>();
  for (const fact of facts) {
    const definition = factDefinition(category, fact.key);
    if (definition?.pairWith) paired.add(definition.pairWith);
  }

  const cells: FactCell[] = [];

  for (const fact of facts) {
    if (paired.has(fact.key)) continue;

    const definition = factDefinition(category, fact.key);
    if (definition?.showInGrid === false) continue;
    if (!factShown(definition, audience, facts)) continue;

    if (fact.present === false) {
      // Dates, numbers, text and enums are omitted when empty. Only a
      // boolean may be negated — "תאריך כניסה: אין" is a false claim.
      if (!absenceIsStated(definition?.type ?? fact.type)) continue;
      cells.push({
        key: fact.key,
        label: unitLabel(definition?.gridLabel ?? fact.label, fact.unit),
        value: 'אין',
        displayValue: 'אין',
        bdi: false,
        absent: true,
        // A register does not record the absence of a balcony. Absence is
        // always the seller's word.
        verified: false,
      });
      continue;
    }

    if (fact.value === null) continue;

    const partner = definition?.pairWith ? byKey.get(definition.pairWith) : undefined;
    // The partner's own DEFINITION carries its grouping, not the partner fact
    // — byKey holds Facts, and grouping is a property of the field.
    const partnerDefinition = definition?.pairWith
      ? factDefinition(category, definition.pairWith)
      : undefined;
    const partnerValue =
      partner && partner.present !== false && partner.value !== null
        ? factValue(partner.value, partnerDefinition?.grouped)
        : undefined;

    // Both halves are required. A fact flagged verified without a citation
    // renders as an ordinary cell rather than as an unbacked badge.
    const cited = fact.source === 'verified' && Boolean(fact.sourceName && fact.sourceDate);

    const value = factValue(fact.value, definition?.grouped);
    cells.push({
      key: fact.key,
      label: unitLabel(definition?.gridLabel ?? fact.label, fact.unit),
      value,
      displayValue: pairedCellText(value, partnerValue),
      bdi: needsBdi(fact.value) || partnerValue !== undefined,
      absent: false,
      verified: cited,
      ...(cited ? { sourceName: fact.sourceName, sourceDate: fact.sourceDate } : {}),
      ...(typeof fact.value === 'number' && fact.key === 'area_sqm' ? { countFrom: fact.value } : {}),
    });
  }

  /*
   * Ordered LAST, after the three-state filtering above.
   *
   * A promoted key belonging to a fact nobody answered never became a cell, so
   * ordering the CELLS rather than the definitions means the grid reflows
   * around what is actually there instead of leaving a hole where a promoted
   * field would have been.
   */
  return orderForAudience(cells, audience, schemaFor(category).investorLead);
}
