import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { DEEPSEEK_URL } from '../../lib/deepseek';
import { OVERPASS_ENDPOINTS } from '../../lib/overpass';
import { supabaseAsUser, supabaseConfigured } from '../../lib/supabase';

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
 *   routing    the walking-time router (self-hosted OSRM if set, else Valhalla)
 *   database   the newest migration the code relies on (0035) is applied
 *
 * The caller's own token and `is_site_admin` decide access, as on /admin.
 * Nothing here reads or changes a listing or a grant (CLAUDE.md §8).
 */
export const prerender = false;

const TIMEOUT_MS = 8_000;

interface Check {
  key: 'ai' | 'overpass' | 'routing' | 'database';
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

async function checkOverpass(): Promise<Check> {
  const answers = await Promise.all(
    OVERPASS_ENDPOINTS.map(async (endpoint) => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

async function checkRouting(): Promise<Check> {
  const osrm = (env as { OSRM_URL?: string }).OSRM_URL;
  const url = osrm
    ? `${osrm.replace(/\/+$/, '')}/table/v1/foot/34.78,32.08;34.79,32.09?sources=0`
    : 'https://valhalla1.openstreetmap.de/status';
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { key: 'routing', ok: response.ok, detail: `${osrm ? 'osrm' : 'valhalla'}_${response.ok ? 'ok' : response.status}` };
  } catch (error) {
    return { key: 'routing', ok: false, detail: `${osrm ? 'osrm' : 'valhalla'}_${failure(error)}` };
  }
}

export const GET: APIRoute = async ({ request }) => {
  if (!supabaseConfigured) return json({ error: 'not_configured' }, 503);
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthenticated' }, 401);

  const client = supabaseAsUser(token);
  const admin = await client.rpc('is_site_admin');
  if (admin.error || admin.data !== true) return json({ error: 'forbidden' }, 403);

  const database = async (): Promise<Check> => {
    // 0035's view. Its absence means the database is behind the code.
    const { error } = await client.from('listing_time_to_link').select('listing_id').limit(1);
    return { key: 'database', ok: !error, detail: error ? 'missing_0035' : 'ok_0035' };
  };

  const checks = await Promise.all([checkAi(), checkOverpass(), checkRouting(), database()]);
  return json({ checks }, 200);
};
