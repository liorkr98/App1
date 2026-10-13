import { EDITOR_STEPS, readFunnel, ratio, type AdminAnalytics } from './admin-data.js';

/**
 * The AI reading of the owner's data page (/api/admin/insights, 0042).
 *
 * The owner chose: on a button, and DeepSeek sees aggregated numbers only.
 * insightsInput is the whole of what is sent — counts, days, step names,
 * categories, template ids, page paths, referring hosts — and parseInsights
 * is the whole of what is shown back: a model's answer is untrusted text,
 * cut to the shape and lengths below, and anything else is a malformed
 * answer rather than something to render.
 */

export type Impact = 'high' | 'medium' | 'low';

export interface Insights {
  summary: string;
  stuck: { step: string; evidence: string }[];
  proposals: { title: string; why: string; how: string; impact: Impact }[];
}

const STEP_NAMES: Record<string, string> = {
  category: 'בחירת סוג (דירה/רכב)',
  details: 'פרטים בסיסיים',
  photos: 'העלאת תמונות',
  rooms: 'חדרים (דירה בלבד)',
  plate: 'מספר רכב (רכב בלבד)',
  consent: 'הסכמה',
  facts: 'נתונים',
  disclosures: 'גילוי נאות',
  description: 'תיאור',
  template: 'בחירת עיצוב',
  preview: 'תצוגה מקדימה',
  publish: 'פרסום',
};

export const INSIGHTS_SYSTEM = [
  'אתה אנליסט מוצר בכיר של "עמוד מכירה" (amudsell.com): אתר ישראלי שבו מתווכי נדל״ן, סוחרי רכב ומוכרים פרטיים',
  'מעלים תמונות ומקבלים תוך דקות עמוד מכירה מקצועי בעברית שנשלח בקישור בוואטסאפ.',
  'קהל היעד הראשי: מתווכים. חינם: 2 עמודים לתמיד; מעבר לזה מנוי (מתווכים/סוחרים) או רכישת עמוד בודד (פרטיים).',
  'תקבל נתונים מצטברים בלבד (ספירות, ימים, שמות שלבים). אין בהם מידע אישי.',
  'המשימה: לזהות איפה אנשים נתקעים ומה הכי כדאי לשפר, ולהציע צעדים מעשיים.',
  'כללים: השתמש רק במספרים שמופיעים בנתונים ואל תמציא. אם יש מעט נתונים, אמור זאת במפורש ותן הצעות זהירות.',
  'השווה לתקופה הקודמת כשזה רלוונטי. אל תציע Stripe ואל תציע להציג נתונים כהערכת שווי.',
  'ענה בעברית פשוטה וישירה, בלי הקדמות.',
  'החזר JSON בלבד, במבנה הזה בדיוק:',
  '{"summary": "2-3 משפטים על המצב", "stuck": [{"step": "שם השלב או האזור", "evidence": "המספרים שמראים את זה"}],',
  '"proposals": [{"title": "הצעה קצרה", "why": "למה, לפי הנתונים", "how": "מה לעשות בפועל", "impact": "high|medium|low"}]}',
  'עד 3 פריטים ב-stuck ו-3 עד 6 הצעות, מסודרות מהחשובה ביותר.',
].join('\n');

/** What the model is given: the aggregates, the derived rates, step names in Hebrew. */
export function insightsInput(data: AdminAnalytics): string {
  const reading = readFunnel(data.funnel, data.current.editors);
  const rates = (period: AdminAnalytics['current']) => ({
    contact_rate: ratio(period.taps, period.views),
    read_rate: ratio(period.reads, period.views),
    publish_per_signup: ratio(period.published, period.signups),
  });
  return JSON.stringify({
    window_days: data.days,
    from: data.from,
    to: data.to,
    this_period: { ...data.current, ...rates(data.current) },
    previous_period: { ...data.previous, ...rates(data.previous) },
    editor_funnel_people: data.funnel.map((row) => ({ ...row, step_name: STEP_NAMES[row.step] ?? row.step })),
    stopped_without_publishing: reading.stoppedTotal,
    listings_by_status_now: data.status,
    accounts_by_kind: data.kinds,
    listings_by_category: data.categories,
    templates_published: data.templates,
    top_listings: data.top_listings.map(({ category, template, status, views, taps, reads }) => ({ category, template, status, views, taps, reads })),
    top_site_pages: data.top_pages,
    top_sources: data.top_sources,
    billing_events: data.billing,
    daily: data.series,
  });
}

const IMPACTS: readonly Impact[] = ['high', 'medium', 'low'];

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** The model's answer, cut to shape, or null when it is not one. */
export function parseInsights(raw: string): Insights | null {
  let value: unknown;
  try {
    value = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  const summary = text(body.summary, 900);
  if (!summary) return null;

  const stuck = (Array.isArray(body.stuck) ? body.stuck : [])
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const step = text(row.step, 80);
      const evidence = text(row.evidence, 400);
      return step && evidence ? { step, evidence } : null;
    })
    .filter((item): item is Insights['stuck'][number] => item !== null)
    .slice(0, 5);

  const proposals = (Array.isArray(body.proposals) ? body.proposals : [])
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>;
      const title = text(row.title, 120);
      const why = text(row.why, 500);
      const how = text(row.how, 600);
      const impact = IMPACTS.includes(row.impact as Impact) ? (row.impact as Impact) : 'medium';
      return title && why && how ? { title, why, how, impact } : null;
    })
    .filter((item): item is Insights['proposals'][number] => item !== null)
    .slice(0, 8);

  if (proposals.length === 0) return null;
  return { summary, stuck, proposals };
}

/** The step's key when the model named one by key, for the page's own label. */
export function stepKey(name: string): string | null {
  return (EDITOR_STEPS as readonly string[]).includes(name) ? name : null;
}

export type InsightsError = 'no_key' | 'no_data' | 'timeout' | 'unavailable' | 'malformed';
export type InsightsResult = { ok: true; insights: Insights } | { ok: false; error: InsightsError };

/** The model call, as the Worker makes it (web/src/lib/deepseek.ts deepseekJson). */
export type AskModel = (request: { system: string; user: string }) => Promise<
  { ok: true; content: string } | { ok: false; reason: 'timeout' | 'network' | 'http' | 'empty' }
>;

/**
 * Ask once, and say plainly what went wrong when it does: no key on the
 * Worker, nothing to read yet, the model too slow, the model unreachable, or
 * an answer that is not the shape asked for. Nothing is stored.
 */
export async function readInsights(data: AdminAnalytics, apiKey: string, ask: AskModel): Promise<InsightsResult> {
  if (!apiKey) return { ok: false, error: 'no_key' };
  const c = data.current;
  if (c.visits + c.views + c.signups + c.created + c.editors === 0) return { ok: false, error: 'no_data' };
  const answer = await ask({ system: INSIGHTS_SYSTEM, user: insightsInput(data) });
  if (!answer.ok) return { ok: false, error: answer.reason === 'timeout' ? 'timeout' : 'unavailable' };
  const insights = parseInsights(answer.content);
  return insights ? { ok: true, insights } : { ok: false, error: 'malformed' };
}
