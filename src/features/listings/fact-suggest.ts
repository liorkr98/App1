import type { Fact } from '../../types/listing.js';
import type { PhotoReview, PhotoSeen } from './photo-review.js';

/**
 * Facts the photographs suggest (18 Oct 2026), for the seller to confirm with
 * one tap. Pure and tested, because what it may NOT do matters more than
 * what it does (CLAUDE.md §7):
 *
 *  - It only fills an UNANSWERED fact. What the seller wrote, or marked
 *    absent, is never second-guessed.
 *  - It only ever says something is THERE. Not seeing a safe room in eight
 *    photographs is not evidence there is none, so it never suggests absence
 *    — that would turn "we do not know" into "no".
 *  - A confirmed suggestion is the seller's declaration (לפי המוכר), like
 *    anything they type. It is never a verified fact.
 */

export type FactSuggestion =
  | { key: string; seen: PhotoSeen; kind: 'present' }
  | { key: string; seen: PhotoSeen; kind: 'option'; option: string }
  | { key: 'color'; seen: PhotoSeen; kind: 'colour' };

/** What a flat's photograph can show, and the fact it answers. */
const PROPERTY: readonly { seen: PhotoSeen; key: string; option?: string }[] = [
  { seen: 'shelter', key: 'shelter' },
  { seen: 'parking', key: 'parking' },
  { seen: 'storage', key: 'storage' },
  { seen: 'elevator', key: 'elevator' },
  // The category schema's own option text (schemas/property.ts).
  { seen: 'renovated', key: 'condition', option: 'משופץ' },
  { seen: 'needsRenovation', key: 'condition', option: 'דורש שיפוץ' },
];

const unanswered = (facts: readonly Fact[], key: string) =>
  facts.some((fact) => fact.key === key && fact.value === null && fact.present);

export function suggestFacts(
  reviews: Iterable<PhotoReview>,
  facts: readonly Fact[],
  category: 'property' | 'vehicle',
): FactSuggestion[] {
  const counts = new Map<PhotoSeen, number>();
  for (const review of reviews) {
    for (const seen of review.seen ?? []) counts.set(seen, (counts.get(seen) ?? 0) + 1);
  }

  if (category === 'vehicle') {
    if (!unanswered(facts, 'color')) return [];
    // The colour most photographs agree on; a tie is not an answer.
    const ranked = [...counts].sort((a, b) => b[1] - a[1]);
    const [first, second] = ranked;
    if (!first || (second && second[1] === first[1])) return [];
    return [{ key: 'color', seen: first[0], kind: 'colour' }];
  }

  const out: FactSuggestion[] = [];
  for (const rule of PROPERTY) {
    if (!counts.has(rule.seen) || !unanswered(facts, rule.key)) continue;
    if (rule.option) {
      // Renovated and needing renovation both seen: the photographs disagree.
      const rival = PROPERTY.find((other) => other.key === rule.key && other.seen !== rule.seen);
      if (rival && counts.has(rival.seen)) continue;
      out.push({ key: rule.key, seen: rule.seen, kind: 'option', option: rule.option });
    } else {
      out.push({ key: rule.key, seen: rule.seen, kind: 'present' });
    }
  }
  return out;
}
