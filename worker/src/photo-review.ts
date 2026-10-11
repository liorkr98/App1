/**
 * The same allow-list as src/features/listings/photo-review.ts.
 *
 * The worker cannot import that file (its rootDir is src/). An answer that
 * is not one of these keys is dropped. Hebrew is not in here.
 */

const ROOMS = ['living', 'kitchen', 'bedroom', 'bathroom', 'balcony', 'outdoor'] as const;
const ISSUES = [
  'dark',
  'blurry',
  'tilted',
  'sideways',
  'portraitCover',
  'clutter',
  'person',
  'documents',
  'plate',
  'blownWindow',
  'tooClose',
] as const;
const TIPS = ['openCurtain', 'stepBack', 'turnOnLight', 'straighten', 'retake', 'hidePlate', 'clearClutter'] as const;

export interface ParsedReview {
  room?: (typeof ROOMS)[number];
  confidence?: number;
  issues: (typeof ISSUES)[number][];
  tip?: (typeof TIPS)[number];
  score?: number;
}

const rooms = new Set<string>(ROOMS);
const issues = new Set<string>(ISSUES);
const tips = new Set<string>(TIPS);

/** Undefined means no label and no advice. */
export function parseReviewAnswer(value: unknown): ParsedReview | undefined {
  let record: unknown = value;
  if (typeof record === 'string') {
    const text = record.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
      record = JSON.parse(text);
    } catch {
      return undefined;
    }
  }
  if (typeof record !== 'object' || record === null) return undefined;
  const row = record as Record<string, unknown>;
  const kept = Array.isArray(row.issues)
    ? row.issues.filter((item): item is (typeof ISSUES)[number] => typeof item === 'string' && issues.has(item))
    : [];
  const room = typeof row.room === 'string' && rooms.has(row.room) ? (row.room as (typeof ROOMS)[number]) : undefined;
  const confidence = typeof row.confidence === 'number' && row.confidence >= 0 && row.confidence <= 1
    ? row.confidence
    : undefined;
  const tip = typeof row.tip === 'string' && tips.has(row.tip) ? (row.tip as (typeof TIPS)[number]) : undefined;
  const score = typeof row.score === 'number' && Number.isInteger(row.score) && row.score >= 1 && row.score <= 5
    ? row.score
    : undefined;
  if (!room && kept.length === 0 && !tip && score === undefined) return undefined;
  return {
    issues: kept,
    ...(room ? { room } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(tip ? { tip } : {}),
    ...(score !== undefined ? { score } : {}),
  };
}
