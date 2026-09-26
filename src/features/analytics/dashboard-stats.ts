/**
 * The arithmetic behind the agent dashboard's tiles and charts.
 *
 * Pure, so it is tested here rather than in a browser the CI cannot sign
 * into. The page fetches rows; everything it SAYS about them comes from
 * these functions.
 *
 * NOTHING IS ESTIMATED. Every number is a count of rows in listing_events
 * (views recorded by the SSR route, taps by /a/{slug}/wa). A day with no rows
 * is a zero, not a gap to interpolate, and a rate with no views is absent,
 * not 0% — "nobody saw it" and "everybody saw it and nobody wrote" are
 * different things to tell an agent.
 */

/** One row of the listing_event_daily view (migration 0029). */
export interface DailyRow {
  listing_id: string;
  /** YYYY-MM-DD, an Israel calendar day. */
  day: string;
  views: number;
  wa_taps: number;
}

export interface DayPoint {
  day: string;
  views: number;
  taps: number;
}

/** YYYY-MM-DD for a Date, in Israel time — the same days the view groups by. */
export function israelDay(date: Date): string {
  // en-CA formats as YYYY-MM-DD; the zone is what matters.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** The `count` Israel days ending with `today`, oldest first. */
export function lastDays(today: Date, count: number): string[] {
  // Today's Israel date at noon UTC. Stepping back whole UTC days from there
  // lands on each calendar day exactly once — Israel is two or three hours
  // ahead, never twelve, so no daylight-saving change can skip or repeat one.
  const [year, month, day] = israelDay(today).split('-').map(Number);
  const anchor = Date.UTC(year!, month! - 1, day!, 12);
  const days: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    days.push(new Date(anchor - back * 86_400_000).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * One point per day, zero-filled, for one listing or (with no id) for all.
 */
export function series(
  rows: readonly DailyRow[],
  days: readonly string[],
  listingId?: string,
): DayPoint[] {
  const byDay = new Map<string, DayPoint>(days.map((day) => [day, { day, views: 0, taps: 0 }]));
  for (const row of rows) {
    if (listingId !== undefined && row.listing_id !== listingId) continue;
    const point = byDay.get(row.day);
    if (!point) continue;
    point.views += Number(row.views) || 0;
    point.taps += Number(row.wa_taps) || 0;
  }
  return days.map((day) => byDay.get(day)!);
}

export function totals(points: readonly DayPoint[]): { views: number; taps: number } {
  return points.reduce(
    (sum, point) => ({ views: sum.views + point.views, taps: sum.taps + point.taps }),
    { views: 0, taps: 0 },
  );
}

/**
 * WhatsApp taps per view, as a percentage with one decimal.
 *
 * Undefined with no views: a rate over nothing is not 0%.
 */
export function contactRate(views: number, taps: number): number | undefined {
  if (!(views > 0)) return undefined;
  return Math.round((taps / views) * 1000) / 10;
}

/**
 * The days since a listing was published, oldest first, capped at `max` so a
 * listing live for a year still draws a readable chart.
 */
export function daysSincePublished(publishedAt: string, today: Date, max = 30): string[] {
  const published = Date.parse(publishedAt);
  if (!Number.isFinite(published)) return [];
  const span = Math.floor((today.getTime() - published) / 86_400_000) + 1;
  return lastDays(today, Math.max(1, Math.min(max, span)));
}
