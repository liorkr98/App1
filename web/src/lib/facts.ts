import type { Fact } from '@app/types/listing';
import { factDefinition } from '@app/features/listings/schemas';
import type { ListingCategory } from '@app/features/listings/schemas';

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
  /** Already display-formatted, without the unit. */
  value: string;
  /** Rendered after the value, outside the <bdi>. */
  unit?: string;
  /** Second value for a paired cell, e.g. floor 3 / 5. */
  pairedValue?: string;
  /** Wrap value (and pairedValue) in <bdi>. */
  bdi: boolean;
  /** Confirmed absent — renders at 35% opacity showing אין. */
  absent: boolean;
}

/**
 * present:false  → a cell showing אין at 35% opacity. The seller said no.
 * value:null     → NO cell at all. The seller never answered.
 *
 * Collapsing these would turn "we do not know" into "no", which is the
 * difference between an honest page and an ad.
 */
export function toCells(category: ListingCategory, facts: Fact[]): FactCell[] {
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

    if (fact.present === false) {
      cells.push({
        key: fact.key,
        label: definition?.gridLabel ?? fact.label,
        value: 'אין',
        bdi: false,
        absent: true,
      });
      continue;
    }

    if (fact.value === null) continue;

    const partner = definition?.pairWith ? byKey.get(definition.pairWith) : undefined;
    const partnerValue =
      partner && partner.present !== false && partner.value !== null
        ? factValue(partner.value)
        : undefined;

    cells.push({
      key: fact.key,
      label: definition?.gridLabel ?? fact.label,
      value: factValue(fact.value),
      ...(fact.unit === undefined ? {} : { unit: fact.unit }),
      ...(partnerValue === undefined ? {} : { pairedValue: partnerValue }),
      bdi: needsBdi(fact.value),
      absent: false,
    });
  }

  return cells;
}
