import type { Fact, FactValue } from '../../types/listing.js';
import { schemaFor, type ListingCategory } from './schemas/index.js';

/**
 * Turning a category schema into facts a seller can answer, and back.
 *
 * Pure and shared, for the same reason the state machine is: these four
 * functions are where the three fact states live (PRD §2), and getting them
 * wrong is not a visual bug — it changes what the published page claims.
 *
 * THE THREE STATES, and why two of them look alike
 *
 *   { value: null,  present: true  }   nobody answered — the page OMITS it
 *   { value: null,  present: false }   the seller said it is ABSENT — אין
 *   { value: x,     present: true  }   answered
 *
 * The first two both have a null value, and collapsing them turns "we do not
 * know" into "no". That distinction is the reason the page reads as a
 * description rather than an advertisement, and CLAUDE.md §12 forbids the
 * collapse by name.
 */

/** A fresh, unanswered fact set for a category. */
export function blankFacts(category: ListingCategory): Fact[] {
  return schemaFor(category).facts.map((definition) => ({
    key: definition.key,
    label: definition.label,
    value: null,
    ...(definition.unit === undefined ? {} : { unit: definition.unit }),
    type: definition.type,

    // present: true with a null value is "not answered yet", not "absent".
    // Absence is something the seller has to say (markAbsent below).
    present: true,
    required: definition.required === true,

    /**
     * ALWAYS 'seller' here, even for the eight vehicle fields the schema
     * marks 'verified'.
     *
     * FactDefinition.source says whether a field CAN be verified. Fact.source
     * says whether this listing's value WAS. A seller typing a mileage is not
     * the Ministry of Transport, and rendering what they typed with a מאומת
     * badge would be a false citation — §7 calls those rules legal, not
     * stylistic. Enrichment overwrites this when a register actually answers.
     */
    source: 'seller',
  }));
}

/** Records an answer. */
export function answer(facts: readonly Fact[], key: string, value: FactValue): Fact[] {
  return facts.map((fact) =>
    fact.key === key
      ? {
          ...fact,
          value,
          // Answering contradicts absence. A seller who marked "no balcony"
          // and then types a balcony size has changed their mind, and leaving
          // present:false would publish a size under the word אין.
          present: true,
        }
      : fact,
  );
}

/**
 * Marks a feature absent — the seller confirming it is not there.
 *
 * The value is dropped, because absent has nothing to show. Keeping a stale
 * number behind present:false is how a "no parking" cell ends up carrying the
 * parking count from before the seller corrected it.
 */
export function markAbsent(facts: readonly Fact[], key: string): Fact[] {
  return facts.map((fact) =>
    fact.key === key ? { ...fact, value: null, present: false } : fact,
  );
}

/** Back to unanswered — neither a value nor a claim of absence. */
export function clear(facts: readonly Fact[], key: string): Fact[] {
  return facts.map((fact) =>
    fact.key === key ? { ...fact, value: null, present: true } : fact,
  );
}

/** What the page will actually show: answered facts and confirmed absences. */
export function answered(facts: readonly Fact[]): Fact[] {
  return facts.filter((fact) => fact.value !== null || !fact.present);
}
