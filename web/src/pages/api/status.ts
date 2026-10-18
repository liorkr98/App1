import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { DEEPSEEK_URL, DEEPSEEK_VISION_MODEL } from '../../lib/deepseek';
import { OVERPASS_ENDPOINTS, USER_AGENT } from '../../lib/overpass';
import { supabaseAsUser, supabaseConfigured } from '../../lib/supabase';
import { supabaseService } from '../../lib/supabase-service';

/**
 * GET /api/status — is everything the product leans on connected? Admin only.
 *
 * Added for go-live (7 Oct 2026). Every outside service here failed in
 * silence before: a missing AI key, a busy map service and an unapplied
 * migration all looked the same from the editor — a plainer page. This
 * answers, in one place, which of them is the reason:
 *
 *   ai         the DeepSeek key is set AND a one-token request succeeds
 *   overpass   how many of the OpenStreetMap instances answer a tiny query
 *   routing    the walking-time router. Self-hosted OSRM if OSRM_URL is set,
 *              and Valhalla behind it, as lib/routing.ts falls back (18 Oct
 *              2026: an OSRM_URL pointing at nothing read as "no walking
 *              times" while Valhalla was answering every listing)
 *   database   every migration the code relies on is applied: one probe per
 *              migration, and the oldest missing one is named (until 18 Oct
 *              it probed 0035 alone and said nothing about 0036 onwards)
 *   phone      the service key is set AND Supabase accepts it (upload from
 *              your phone). Added 12 Oct 2026, after a key pasted at the
 *              wrong length failed every phone upload with no sign anywhere
 *   photos     the photo check's model answers a request with a picture in
 *              it — not the same as `ai`, which only proves the text model
 *
 * The caller's own token and `is_site_admin` decide access, as on /admin.
 * Nothing here reads or changes a listing or a grant (CLAUDE.md §8).
 */
export const prerender = false;

const TIMEOUT_MS = 8_000;

interface Check {
  key: 'ai' | 'overpass' | 'routing' | 'database' | 'phone' | 'photos';
  ok: boolean;
  detail: string;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

function failure(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network';
}

async function checkAi(): Promise<Check> {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) return { key: 'ai', ok: false, detail: 'no_key' };
  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 1, messages: [{ role: 'user', content: 'שלום' }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { key: 'ai', ok: response.ok, detail: response.ok ? 'ok' : `http_${response.status}` };
  } catch (error) {
    return { key: 'ai', ok: false, detail: failure(error) };
  }
}

/** A 1×1 PNG: the smallest picture that proves the model takes pictures. */
const DOT_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function checkPhotos(): Promise<Check> {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) return { key: 'photos', ok: false, detail: 'no_key' };
  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: DEEPSEEK_VISION_MODEL,
        max_tokens: 1,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'ok' },
              { type: 'image_url', image_url: { url: DOT_PNG, detail: 'low' } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { key: 'photos', ok: response.ok, detail: response.ok ? 'ok' : `http_${response.status}` };
  } catch (error) {
    return { key: 'photos', ok: false, detail: failure(error) };
  }
}

async function checkPhone(): Promise<Check> {
  const client = supabaseService();
  if (!client) return { key: 'phone', ok: false, detail: 'no_service_key' };
  try {
    const { error, status } = await client.from('photo_portals').select('id').limit(1);
    if (!error) return { key: 'phone', ok: true, detail: 'ok' };
    if (status === 401 || status === 403) return { key: 'phone', ok: false, detail: 'bad_service_key' };
    return { key: 'phone', ok: false, detail: error.code === '42P01' ? 'missing_0036' : `http_${status}` };
  } catch (error) {
    return { key: 'phone', ok: false, detail: failure(error) };
  }
}

async function checkOverpass(): Promise<Check> {
  const answers = await Promise.all(
    OVERPASS_ENDPOINTS.map(async (endpoint) => {
      try {
        // The same identification the real query sends (lib/overpass.ts):
        // overpass-api.de refuses a request without one, so a check without
        // it reported the service down when it was not.
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
          body: new URLSearchParams({ data: '[out:json][timeout:5];node(1);out ids;' }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return response.ok;
      } catch {
        return false;
      }
    }),
  );
  const up = answers.filter(Boolean).length;
  return { key: 'overpass', ok: up > 0, detail: `${up}/${answers.length}` };
}

async function reach(url: string): Promise<string> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return response.ok ? 'ok' : String(response.status);
  } catch (error) {
    return failure(error);
  }
}

async function checkRouting(): Promise<Check> {
  const osrm = (env as { OSRM_URL?: string }).OSRM_URL;
  if (osrm) {
    const answer = await reach(`${osrm.replace(/\/+$/, '')}/table/v1/foot/34.78,32.08;34.79,32.09?sources=0`);
    if (answer === 'ok') return { key: 'routing', ok: true, detail: 'osrm_ok' };
    // lib/routing.ts goes on to Valhalla, so walking times still work if it answers.
    const fallback = await reach('https://valhalla1.openstreetmap.de/status');
    return fallback === 'ok'
      ? { key: 'routing', ok: true, detail: 'osrm_down_valhalla_ok' }
      : { key: 'routing', ok: false, detail: `valhalla_${fallback}` };
  }
  const answer = await reach('https://valhalla1.openstreetmap.de/status');
  return { key: 'routing', ok: answer === 'ok', detail: `valhalla_${answer}` };
}

/**
 * One table or column each migration added, newest last. A select of it
 * fails while the migration is missing. Add a row with every migration the
 * code starts to rely on.
 */
const MIGRATION_PROBES: readonly [migration: string, table: string, column: string][] = [
  ['0035', 'listing_time_to_link', 'listing_id'],
  ['0036', 'photo_inbox', 'id'],
  ['0037', 'photo_reviews', 'id'],
  ['0040', 'plans', 'page_limit'],
  ['0041', 'profiles', 'page_enabled'],
  ['0042', 'site_page_views', 'id'],
  ['0043', 'listings', 'price_was'],
  ['0044', 'listings', 'translations'],
  ['0046', 'listings', 'share_line'],
];

export const GET: APIRoute = async ({ request }) => {
  if (!supabaseConfigured) return json({ error: 'not_configured' }, 503);
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthenticated' }, 401);

  const client = supabaseAsUser(token);
  const admin = await client.rpc('is_site_admin');
  if (admin.error || admin.data !== true) return json({ error: 'forbidden' }, 403);

  const database = async (): Promise<Check> => {
    const missing = await Promise.all(
      MIGRATION_PROBES.map(async ([migration, table, column]) => {
        const { error } = await client.from(table).select(column).limit(1);
        return error ? migration : null;
      }),
    );
    // 0045 adds rows, not a column: its plan is the probe.
    const plan = await client.from('plans').select('key').eq('key', 'agent_basic').maybeSingle();
    const all = [...missing, plan.error || !plan.data ? '0045' : null].filter((item): item is string => item !== null).sort();
    const newest = MIGRATION_PROBES[MIGRATION_PROBES.length - 1]![0];
    return all.length === 0
      ? { key: 'database', ok: true, detail: `ok_${newest}` }
      : { key: 'database', ok: false, detail: `missing_${all[0]}` };
  };

  const checks = await Promise.all([
    checkAi(),
    checkPhotos(),
    checkPhone(),
    checkOverpass(),
    checkRouting(),
    database(),
  ]);
  return json({ checks }, 200);
};
