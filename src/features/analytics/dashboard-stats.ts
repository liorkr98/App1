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

/**
 * Read-through: how many buyers who opened the page reached the agent block.
 *
 * One row of listing_event_daily's newer columns (migration 0030). Fetched on
 * its own so a database without 0030 still draws every other number.
 */
export interface ReadRow {
  listing_id: string;
  day: string;
  views: number;
  read_to_agent: number;
}

/** Views and reads in the window, for one listing or (with no id) for all. */
export function readThrough(
  rows: readonly ReadRow[],
  days: readonly string[],
  listingId?: string,
): { views: number; reads: number } {
  const window = new Set(days);
  let views = 0;
  let reads = 0;
  for (const row of rows) {
    if (listingId !== undefined && row.listing_id !== listingId) continue;
    if (!window.has(row.day)) continue;
    views += Number(row.views) || 0;
    reads += Number(row.read_to_agent) || 0;
  }
  return { views, reads };
}

/**
 * Reads per view as a whole percentage, capped at 100.
 *
 * A reader who reloads the page can send the beacon twice for one view, so
 * the raw ratio can pass 100% and would claim more than happened. Undefined
 * with no views, like contactRate.
 */
export function readRate(views: number, reads: number): number | undefined {
  if (!(views > 0)) return undefined;
  return Math.min(100, Math.round((Math.max(0, reads) / views) * 100));
}

/**
 * Time to link: from starting a listing to first sharing its link (plan §0,
 * the product's own promise — under four minutes). One row of
 * listing_time_to_link (migration 0035), fetched on its own like ReadRow.
 */
export interface LinkRow {
  listing_id: string;
  started_at: string;
  published_at: string | null;
  first_share_at: string | null;
}

/** Whole-second minutes from one timestamp to another; undefined if either is missing or it runs backwards. */
export function minutesBetween(from: string | null | undefined, to: string | null | undefined): number | undefined {
  if (!from || !to) return undefined;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined;
  return Math.round((end - start) / 1000) / 60;
}

/** Minutes from starting to first sharing, for one row. */
export function timeToLink(row: LinkRow): number | undefined {
  return minutesBetween(row.started_at, row.first_share_at);
}

/**
 * The median. Not the mean: one listing edited over two days would drag a
 * mean into hours and say nothing about the agent's usual four minutes.
 */
export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * A duration as the dashboard says it: "3:52" under an hour (the promise is
 * in minutes, so it reads like the race on the homepage), whole hours under
 * two days, whole days beyond. The unit is a locale key, not a word here.
 */
export function durationParts(minutes: number): { value: string; unit: 'minutes' | 'hours' | 'days' } {
  const seconds = Math.round(minutes * 60);
  if (seconds < 3600) {
    const whole = Math.floor(seconds / 60);
    return { value: `${whole}:${String(seconds % 60).padStart(2, '0')}`, unit: 'minutes' };
  }
  if (minutes < 48 * 60) return { value: String(Math.round(minutes / 60)), unit: 'hours' };
  return { value: String(Math.round(minutes / (60 * 24))), unit: 'days' };
}
