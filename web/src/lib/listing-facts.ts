import {
  factsFromSchema,
  type CategorySchema,
  type Fact,
  type FactValue,
  type Provenance,
} from '@/types/listing';

/** `null` leaves a fact unanswered; `{ absent: true }` marks it confirmed absent. */
export type Answer = FactValue | { absent: true };

/**
 * Builds a category's facts from answers, optionally marking the ones a
 * public register filled.
 *
 * `verifiedBy` stands in for a plate lookup having run. It promotes exactly
 * the facts the SCHEMA says are verifiable and that actually got a value —
 * never a field the seller typed, and never an empty one.
 */
export function answer(
  schema: CategorySchema,
  values: Record<string, Answer>,
  verifiedBy?: Provenance,
): Fact[] {
  const verifiable = new Set(
    schema.facts.filter((definition) => definition.source === 'verified').map((d) => d.key),
  );

  return factsFromSchema(schema).map((fact) => {
    const promote = (next: Fact): Fact =>
      verifiedBy && verifiable.has(next.key) && next.value !== null
        ? { ...next, source: 'verified', ...verifiedBy }
        : next;

    if (!(fact.key in values)) return fact;
    const given = values[fact.key];
    if (given !== null && typeof given === 'object' && 'absent' in given) {
      return { ...fact, present: false };
    }
    return promote({ ...fact, value: given ?? null });
  });
}
