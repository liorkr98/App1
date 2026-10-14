/**
 * The owner's data page (/admin/data/, migration 0042): the shape
 * admin_analytics returns and the arithmetic the page and the AI route do on
 * it. Pure, so it is tested here rather than in a browser.
 *
 * Everything in AdminAnalytics is a count, a day, a step name, a category,
 * a template id, a page path, a referring host or a listing slug. No email,
 * name, phone or listing text — which is why the AI route may send it as is.
 */

export const EDITOR_STEPS = [
  'category', 'details', 'photos', 'rooms', 'plate', 'consent',
  'facts', 'disclosures', 'description', 'template', 'preview', 'publish',
] as const;
export type EditorStep = (typeof EDITOR_STEPS)[number];

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

export interface PeriodTotals {
  signups: number;
  created: number;
  published: number;
  publishers: number;
  views: number;
  taps: number;
  reads: number;
  shares: number;
  visits: number;
  editors: number;
  paywall: number;
  payments: number;
  median_minutes_to_publish: number | null;
}

export interface SeriesRow {
  day: string;
  signups: number;
  created: number;
  published: number;
  views: number;
  taps: number;
  visits: number;
}

export interface FunnelRow {
  step: string;
  entered: number;
  blocked: number;
  publish_ok: number;
  publish_fail: number;
  /** People who did not publish, whose furthest step was this one. */
  stopped: number;
}

export interface AdminAnalytics {
  days: number;
  from: string;
  to: string;
  current: PeriodTotals;
  previous: PeriodTotals;
  series: SeriesRow[];
  funnel: FunnelRow[];
  status: Record<string, number>;
  kinds: { kind: string; accounts: number; new: number }[];
  categories: { category: string; created: number; published: number }[];
  templates: { template: string; published: number }[];
  top_listings: { slug: string; category: string; template: string; status: string; views: number; taps: number; reads: number }[];
  top_pages: { path: string; views: number }[];
  top_sources: { source: string; views: number }[];
  billing: Record<string, number>;
}

export function isRange(value: unknown): value is Range {
  return RANGES.includes(Number(value) as Range);
}

/** a / b, or null when there is nothing to divide by. */
export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export interface Delta {
  /** current − previous. */
  change: number;
  /** The change as a fraction of the previous period, null when that was 0. */
  fraction: number | null;
  direction: 'up' | 'down' | 'flat';
}

export function delta(current: number, previous: number): Delta {
  const change = current - previous;
  return {
    change,
    fraction: previous > 0 ? change / previous : null,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
  };
}

export interface StopReading {
  step: string;
  stopped: number;
  /** Share of everyone who stopped, 0..1. */
  share: number;
}

export interface FunnelReading {
  /** People who opened the editor in the window. */
  editors: number;
  /** People who published from the editor in the window. */
  finished: number;
  /** Everyone who opened the editor and did not publish. */
  stoppedTotal: number;
  /** Steps where somebody stopped, in editor order. */
  stops: StopReading[];
  /** Where the most people stopped, or null when nobody did. Ties go to the earlier step. */
  worst: StopReading | null;
}

/**
 * Where people stop. Not the drop between neighbouring steps: 'rooms' is a
 * flat's step and 'plate' a car's, so the count between them falls for
 * reasons that are nobody getting stuck. admin_analytics already counts each
 * person once, at the furthest step they reached without publishing.
 */
export function readFunnel(funnel: readonly FunnelRow[], editors: number): FunnelReading {
  const stoppedTotal = funnel.reduce((sum, row) => sum + row.stopped, 0);
  const finished = Math.max(0, ...funnel.map((row) => row.publish_ok));
  const stops = funnel
    .filter((row) => row.stopped > 0)
    .map((row) => ({ step: row.step, stopped: row.stopped, share: row.stopped / stoppedTotal }));
  let worst: StopReading | null = null;
  for (const stop of stops) if (!worst || stop.stopped > worst.stopped) worst = stop;
  return { editors, finished, stoppedTotal, stops, worst };
}

/** A clean upper bound and ticks for a count axis: 0 and up to four round steps. */
export function countTicks(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power;
  const whole = Math.max(1, step);
  const top = Math.ceil(max / whole) * whole;
  const ticks: number[] = [];
  for (let tick = 0; tick <= top + whole / 2; tick += whole) ticks.push(Math.round(tick));
  return { top, ticks };
}

/** 1,284 / 12.9K: compact from ten thousand up, whole numbers below. */
export function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${trim(value / 1_000_000)}M`;
  if (Math.abs(value) >= 10_000) return `${trim(value / 1_000)}K`;
  return Math.round(value).toLocaleString('en-US');
}

function trim(value: number): string {
  return value.toFixed(value >= 100 ? 0 : 1).replace(/\.0$/, '');
}

/** A percentage for a 0..1 fraction: one decimal under 10%, whole above. */
export function percent(fraction: number): string {
  const value = fraction * 100;
  return `${Math.abs(value) < 10 && value !== 0 ? value.toFixed(1).replace(/\.0$/, '') : Math.round(value)}%`;
}

/** "13/10" for "2026-10-13". */
export function shortDay(day: string): string {
  const [, month, date] = day.split('-');
  return `${Number(date)}/${Number(month)}`;
}
