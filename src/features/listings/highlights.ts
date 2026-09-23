import type { Fact } from '../../types/listing.js';

/**
 * Highlight chips on the listing first screen.
 *
 * Chosen by the agent from this list, plus one custom string. Max three.
 * When the agent has not chosen, the page suggests up to three from the
 * facts — a terrace larger than half the flat comes before a yes/no feature.
 * Copied onto the listing row at publish so the page never reads the profile.
 */

export const HIGHLIGHT_LABELS = [
  'ממ״ד',
  'מרפסת שמש',
  'חניה',
  'מעלית',
  'משופצת',
  'נוף פתוח',
  'דירת גן',
  'פנטהאוז',
  'קומה גבוהה',
  'כניסה מיידית',
  'מחסן',
  'מיזוג מרכזי',
] as const;

export type HighlightLabel = (typeof HIGHLIGHT_LABELS)[number];

const MAX_HIGHLIGHTS = 3;

export function listingHighlights(values: readonly string[] | undefined): string[] {
  if (!values || values.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const label = raw.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
    if (out.length === MAX_HIGHLIGHTS) break;
  }
  return out;
}

function answered(facts: readonly Fact[], key: string): Fact | undefined {
  const fact = facts.find((candidate) => candidate.key === key);
  if (!fact || fact.present === false || fact.value === null || fact.value === '') return undefined;
  return fact;
}

function numeric(facts: readonly Fact[], key: string): number | null {
  const fact = answered(facts, key);
  return fact && typeof fact.value === 'number' && Number.isFinite(fact.value) ? fact.value : null;
}

function flag(facts: readonly Fact[], key: string): boolean {
  const fact = answered(facts, key);
  return fact?.value === true;
}

function text(facts: readonly Fact[], key: string): string | null {
  const fact = answered(facts, key);
  return typeof fact?.value === 'string' ? fact.value : null;
}

/**
 * Up to three chips derived from the facts, when the agent left the list empty.
 *
 * Order is the exceptional case first (terrace, top floor, renovated), then
 * the fixed list, and only a feature the facts actually support.
 */
export function suggestHighlights(facts: readonly Fact[]): string[] {
  const out: string[] = [];
  const push = (label: string) => {
    if (out.length >= MAX_HIGHLIGHTS || out.includes(label)) return;
    out.push(label);
  };

  const area = numeric(facts, 'area_sqm');
  const balcony = numeric(facts, 'balcony_sqm');
  if (area !== null && area > 0 && balcony !== null && balcony >= area * 0.5) {
    const sqm = Number.isInteger(balcony) ? String(balcony) : String(balcony);
    push(`מרפסת ${sqm} מ״ר`);
  }

  const floor = numeric(facts, 'floor');
  const total = numeric(facts, 'total_floors');
  if (floor !== null && total !== null && total > 0 && floor === total) {
    push('קומה אחרונה');
  }

  const condition = text(facts, 'condition');
  if (condition === 'משופץ' || condition === 'חדש מקבלן') push('משופצת');

  if (flag(facts, 'shelter')) push('ממ״ד');
  if (flag(facts, 'parking')) push('חניה');
  if (flag(facts, 'elevator')) push('מעלית');
  if (text(facts, 'entry_date') === 'מיידי') push('כניסה מיידית');
  if (flag(facts, 'storage')) push('מחסן');

  return out;
}

/** The agent's choice when they made one; otherwise the suggestion. */
export function resolveHighlights(
  chosen: readonly string[] | undefined,
  facts: readonly Fact[],
): string[] {
  const picked = listingHighlights(chosen);
  return picked.length > 0 ? picked : suggestHighlights(facts);
}
