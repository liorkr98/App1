import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { isRange, type AdminAnalytics } from '@/features/analytics/admin-data';
import { readInsights } from '@/features/analytics/insights';

import { deepseekJson } from '../../../lib/deepseek';
import { supabaseAsUser, supabaseConfigured } from '../../../lib/supabase';

export const prerender = false;

/**
 * POST /api/admin/insights — the "AI analysis" button on /admin/data/.
 *
 * The owner's choices (13 Oct 2026): on a button, never on page load, and
 * DeepSeek sees aggregated numbers only. The admin's own token reads
 * admin_analytics, so the database decides who is an admin (0042 raises
 * 42501 for anyone else); the Worker holds no list of admins and uses no
 * service-role key. Only that aggregate goes to the model
 * (src/features/analytics/insights.ts). Nothing is stored or logged.
 */
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export const POST: APIRoute = async ({ request }) => {
  if (!supabaseConfigured) return json({ error: 'unavailable' }, 503);
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthenticated' }, 401);

  let days = 30;
  try {
    const asked = ((await request.json()) as { days?: unknown }).days;
    if (isRange(asked)) days = Number(asked);
  } catch {
    // The default window.
  }

  const { data, error } = await supabaseAsUser(token).rpc('admin_analytics', { p_days: days });
  if (error) return json({ error: error.code === '42501' ? 'forbidden' : 'unavailable' }, error.code === '42501' ? 403 : 502);
  if (!data || typeof data !== 'object') return json({ error: 'unavailable' }, 502);

  const apiKey = typeof env.DEEPSEEK_API_KEY === 'string' ? env.DEEPSEEK_API_KEY : '';
  const result = await readInsights(data as AdminAnalytics, apiKey, (ask) => deepseekJson({ apiKey, ...ask }));
  if (result.ok) return json({ insights: result.insights }, 200);
  return json({ error: result.error }, result.error === 'no_data' ? 200 : 502);
};
