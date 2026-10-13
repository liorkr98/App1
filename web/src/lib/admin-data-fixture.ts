import type { AdminAnalytics, FunnelRow, PeriodTotals, Range, SeriesRow } from '@/features/analytics/admin-data';
import type { Insights } from '@/features/analytics/insights';

/**
 * Sample numbers for the data page's CI fixture (/template-check/admin-data/,
 * never deployed). Fixed, not random, so screenshots compare. Shaped like a
 * young product: a few hundred visits a day, a handful of pages.
 */
const END = Date.UTC(2026, 9, 13);
const DAY = 86_400_000;

const wave = (i: number, base: number, swing: number, period = 7) =>
  Math.max(0, Math.round(base + swing * Math.sin((i / period) * Math.PI * 2) + ((i * 37) % 11) - 5));

const series = (days: number, offset = 0): SeriesRow[] =>
  Array.from({ length: days }, (_, k) => {
    const i = k + offset;
    const day = new Date(END - (days - 1 - k + offset) * DAY).toISOString().slice(0, 10);
    const visits = wave(i, 210 + k * 2, 60);
    return {
      day,
      visits,
      views: wave(i + 3, 140 + k, 45),
      signups: Math.max(0, Math.round(visits / 70) - (i % 3 === 0 ? 1 : 0)),
      created: Math.max(0, Math.round(visits / 55) - (i % 4 === 0 ? 2 : 0)),
      published: Math.max(0, Math.round(visits / 95) - (i % 5 === 0 ? 1 : 0)),
      taps: wave(i, 9, 4),
    };
  });

const totals = (rows: SeriesRow[], median: number): PeriodTotals => {
  const sum = (key: keyof SeriesRow) => rows.reduce((total, row) => total + Number(row[key]), 0);
  const views = sum('views');
  return {
    signups: sum('signups'),
    created: sum('created'),
    published: sum('published'),
    publishers: Math.round(sum('published') * 0.6),
    views,
    taps: sum('taps'),
    reads: Math.round(views * 0.31),
    shares: Math.round(sum('published') * 1.8),
    visits: sum('visits'),
    editors: Math.round(sum('created') * 1.4),
    paywall: Math.round(sum('signups') * 0.2),
    payments: 0,
    median_minutes_to_publish: median,
  };
};

const funnel = (scale: number): FunnelRow[] => {
  const s = (n: number) => Math.round(n * scale);
  return [
    { step: 'category', entered: s(100), blocked: 0, publish_ok: 0, publish_fail: 0, stopped: s(6) },
    { step: 'details', entered: s(94), blocked: s(3), publish_ok: 0, publish_fail: 0, stopped: s(5) },
    { step: 'photos', entered: s(89), blocked: s(14), publish_ok: 0, publish_fail: 0, stopped: s(21) },
    { step: 'rooms', entered: s(51), blocked: s(2), publish_ok: 0, publish_fail: 0, stopped: s(2) },
    { step: 'plate', entered: s(17), blocked: s(4), publish_ok: 0, publish_fail: 0, stopped: s(3) },
    { step: 'consent', entered: s(63), blocked: s(1), publish_ok: 0, publish_fail: 0, stopped: s(4) },
    { step: 'facts', entered: s(59), blocked: s(2), publish_ok: 0, publish_fail: 0, stopped: s(3) },
    { step: 'disclosures', entered: s(56), blocked: 0, publish_ok: 0, publish_fail: 0, stopped: s(2) },
    { step: 'description', entered: s(54), blocked: 0, publish_ok: 0, publish_fail: 0, stopped: s(4) },
    { step: 'template', entered: s(50), blocked: 0, publish_ok: 0, publish_fail: 0, stopped: s(3) },
    { step: 'preview', entered: s(47), blocked: 0, publish_ok: 0, publish_fail: 0, stopped: s(6) },
    { step: 'publish', entered: s(41), blocked: s(9), publish_ok: s(38), publish_fail: s(3), stopped: 0 },
  ];
};

export function fixtureAnalytics(days: Range): AdminAnalytics {
  const current = series(days);
  const previous = series(days, days).map((row) => ({ ...row, visits: Math.round(row.visits * 0.8), views: Math.round(row.views * 0.85) }));
  const scale = days / 30;
  return {
    days,
    from: current[0]?.day ?? '',
    to: current.at(-1)?.day ?? '',
    current: totals(current, 6.5),
    previous: totals(previous, 9),
    series: current,
    funnel: funnel(scale),
    status: { draft: 41, published: 63, sold: 12, archived: 7, unpublished: 2 },
    kinds: [
      { kind: 'agent', accounts: 88, new: Math.round(31 * scale) },
      { kind: 'private', accounts: 54, new: Math.round(19 * scale) },
      { kind: 'dealer', accounts: 9, new: Math.round(3 * scale) },
      { kind: 'office', accounts: 4, new: Math.round(1 * scale) },
      { kind: 'unknown', accounts: 6, new: Math.round(2 * scale) },
    ],
    categories: [
      { category: 'property', created: Math.round(118 * scale), published: Math.round(71 * scale) },
      { category: 'vehicle', created: Math.round(22 * scale), published: Math.round(11 * scale) },
    ],
    templates: [
      { template: 'aurora', published: Math.round(24 * scale) },
      { template: 'atelier', published: Math.round(17 * scale) },
      { template: 'blueprint', published: Math.round(12 * scale) },
      { template: 'dossier', published: Math.round(8 * scale) },
    ],
    top_listings: [
      { slug: 'T4V7A', category: 'property', template: 'aurora', status: 'published', views: 812, taps: 41, reads: 260 },
      { slug: 'H2N8P', category: 'property', template: 'atelier', status: 'sold', views: 604, taps: 37, reads: 190 },
      { slug: 'G7F2K', category: 'vehicle', template: 'dossier', status: 'published', views: 455, taps: 12, reads: 88 },
      { slug: 'M3Q9R', category: 'property', template: 'blueprint', status: 'published', views: 301, taps: 9, reads: 77 },
    ],
    top_pages: [
      { path: '/', views: Math.round(3900 * scale) },
      { path: '/pricing/', views: Math.round(1210 * scale) },
      { path: '/agents/', views: Math.round(860 * scale) },
      { path: '/templates/', views: Math.round(540 * scale) },
      { path: '/guide/privacy/', views: Math.round(210 * scale) },
      { path: '/agent/', views: Math.round(150 * scale) },
    ],
    top_sources: [
      { source: 'direct', views: Math.round(2600 * scale) },
      { source: 'google.com', views: Math.round(1900 * scale) },
      { source: 'whatsapp', views: Math.round(1100 * scale) },
      { source: 'internal', views: Math.round(800 * scale) },
      { source: 'facebook.com', views: Math.round(420 * scale) },
    ],
    billing: { paywall_shown: Math.round(24 * scale), free_limit_hit: Math.round(11 * scale), plan_selected: Math.round(5 * scale) },
  };
}

export const FIXTURE_INSIGHTS: Insights = {
  summary: 'התנועה עלתה מול התקופה הקודמת, אבל כרבע מכל מי שהתחיל ולא פרסם עצר בשלב התמונות. מי שעובר את התמונות מגיע כמעט תמיד לפרסום.',
  stuck: [
    { step: 'photos', evidence: '21 מתוך 59 שלא פרסמו עצרו בתמונות, ו־14 נחסמו שם.' },
    { step: 'preview', evidence: '6 הגיעו לתצוגה המקדימה ולא פרסמו.' },
  ],
  proposals: [
    {
      title: 'להבליט את "העלאה מהטלפון" בשלב התמונות',
      why: 'שלב התמונות הוא המקום שבו הכי הרבה אנשים עוצרים.',
      how: 'להציג את קוד ה־QR כבר בכניסה לשלב, עם משפט אחד שמסביר.',
      impact: 'high',
    },
    {
      title: 'מייל תזכורת למי שעצר באמצע',
      why: '59 אנשים פתחו עמוד ולא פרסמו.',
      how: 'תזכורת אחת אחרי 24 שעות, עם קישור ישיר לטיוטה.',
      impact: 'medium',
    },
    {
      title: 'לבדוק את עמוד המחירים',
      why: 'עמוד המחירים הוא השני בכניסות, אבל מעט נרשמים אחריו.',
      how: 'להוסיף דוגמה חיה ומשפט על 2 העמודים החינמיים.',
      impact: 'low',
    },
  ],
};
