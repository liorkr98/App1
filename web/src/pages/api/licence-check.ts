import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { licenceVerdict, normalizeLicence } from '@/features/billing/licence';

import { supabaseAsUser, supabaseConfigured } from '../../lib/supabase';
import { supabaseService } from '../../lib/supabase-service';

export const prerender = false;

/**
 * POST /api/licence-check — is this broker licence in the Justice Ministry
 * register? (docs/PRICING.md: agent and office plans need a licence that
 * checked out.)
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8. Fail closed: no register configured, the register down, an
 * odd answer — all "not verified", and the person can still use the free
 * and private plans. Only an exact match calls `mark_licence_verified`
 * (service role); a person cannot set that column themselves (0040).
 * ======================================================================
 *
 * This runs when the person asks, at signup or in /me — never at page
 * render (CLAUDE.md §12). The register is data.gov.il, by the resource id
 * in the Worker variable BROKER_REGISTER_RESOURCE_ID (docs/DEPLOY.md).
 */
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export const POST: APIRoute = async ({ request }) => {
  if (!supabaseConfigured) return json({ verdict: 'unavailable' }, 503);
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthenticated' }, 401);

  const { data: who, error: whoError } = await supabaseAsUser(token).auth.getUser(token);
  if (whoError || !who.user) return json({ error: 'unauthenticated' }, 401);

  let licence: string | null = null;
  try {
    licence = normalizeLicence(((await request.json()) as { licence?: unknown }).licence);
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!licence) return json({ verdict: 'not_found' }, 200);

  const resource = typeof env.BROKER_REGISTER_RESOURCE_ID === 'string' ? env.BROKER_REGISTER_RESOURCE_ID.trim() : '';
  if (!/^[0-9a-f-]{36}$/i.test(resource)) return json({ verdict: 'unavailable' }, 200);

  let verdict: ReturnType<typeof licenceVerdict> = 'unavailable';
  try {
    const params = new URLSearchParams({ resource_id: resource, q: licence, limit: '20' });
    const answer = await fetch(`https://data.gov.il/api/3/action/datastore_search?${params}`, {
      headers: { 'User-Agent': 'amudsell.com licence check (https://amudsell.com/contact/)' },
      signal: AbortSignal.timeout(8000),
    });
    verdict = answer.ok ? licenceVerdict(await answer.json(), licence) : 'unavailable';
  } catch {
    verdict = 'unavailable';
  }

  if (verdict === 'verified') {
    const service = supabaseService();
    if (!service) return json({ verdict: 'unavailable' }, 200);
    const { error } = await service.rpc('mark_licence_verified', { p_user_id: who.user.id, p_licence: licence });
    if (error) {
      console.warn(`licence_check mark_failed ${error.code ?? 'unknown'}`);
      return json({ verdict: 'unavailable' }, 200);
    }
  }
  return json({ verdict }, 200);
};
