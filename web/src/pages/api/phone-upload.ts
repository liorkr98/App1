import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';

import { MAX_IMAGES } from '@/features/listings/editor';
import {
  checkWebp,
  hashPortalToken,
  isDimension,
  isPortalToken,
  PHONE_UPLOAD_MAX_BYTES,
  phoneUploadPath,
} from '@/features/listings/phone-portal';

import { supabaseService } from '../../lib/supabase-service';

/**
 * /api/phone-upload — the phone's half of "upload from your phone" (0036).
 *
 *   GET   is this QR still good, and how many have been sent?
 *   POST  one photograph, already stripped and re-encoded on the phone
 *
 * The phone is not signed in. The token in `X-Portal-Token` is the whole
 * authorisation: its SHA-256 must match an open, unexpired portal, and the
 * portal decides the listing — never anything in the request. Only then does
 * the service-role client write, and only under that listing's `browser/`
 * prefix and into its inbox. The editor on the computer collects from there.
 *
 * Nothing is logged except reason codes (CLAUDE.md §9: never log PII; a token
 * is a credential).
 */
export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

interface Portal {
  id: string;
  listing_id: string;
  expires_at: string;
  closed_at: string | null;
}

type Found = { portal: Portal; sent: number } | { error: Response };

async function openPortal(client: SupabaseClient, request: Request): Promise<Found> {
  const token = request.headers.get('x-portal-token') ?? '';
  if (!isPortalToken(token)) return { error: json({ error: 'unknown' }, 404) };

  const { data, error } = await client
    .from('photo_portals')
    .select('id, listing_id, expires_at, closed_at')
    .eq('token_hash', await hashPortalToken(token))
    .maybeSingle();
  if (error) {
    console.warn('phone_upload lookup_failed');
    return { error: json({ error: 'unavailable' }, 502) };
  }
  const portal = data as Portal | null;
  if (!portal) return { error: json({ error: 'unknown' }, 404) };
  if (portal.closed_at || Date.parse(portal.expires_at) <= Date.now()) {
    return { error: json({ error: 'expired' }, 410) };
  }

  const { count } = await client
    .from('photo_inbox')
    .select('id', { count: 'exact', head: true })
    .eq('portal_id', portal.id);
  return { portal, sent: count ?? 0 };
}

export const GET: APIRoute = async ({ request }) => {
  const client = supabaseService();
  if (!client) return json({ error: 'not_configured' }, 503);
  const found = await openPortal(client, request);
  if ('error' in found) return found.error;
  return json(
    { ok: true, sent: found.sent, remaining: Math.max(0, MAX_IMAGES - found.sent), expiresAt: found.portal.expires_at },
    200,
  );
};

export const POST: APIRoute = async ({ request, url }) => {
  const client = supabaseService();
  if (!client) return json({ error: 'not_configured' }, 503);
  const found = await openPortal(client, request);
  if ('error' in found) return found.error;
  const { portal, sent } = found;

  if (sent >= MAX_IMAGES) return json({ error: 'full' }, 409);

  const width = Number(url.searchParams.get('w'));
  const height = Number(url.searchParams.get('h'));
  if (!isDimension(width) || !isDimension(height)) return json({ error: 'bad_request' }, 400);

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > PHONE_UPLOAD_MAX_BYTES) return json({ error: 'too_large' }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > PHONE_UPLOAD_MAX_BYTES) return json({ error: 'too_large' }, 413);

  const checked = checkWebp(bytes);
  if (!checked.ok) {
    console.warn(`phone_upload refused ${checked.reason}`);
    return json({ error: checked.reason }, 422);
  }

  const path = phoneUploadPath(portal.listing_id, Date.now(), crypto.randomUUID());
  const stored = await client.storage.from('derived').upload(path, bytes, {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: false,
  });
  if (stored.error) {
    console.warn('phone_upload storage_failed');
    return json({ error: 'unavailable' }, 502);
  }
  const publicUrl = client.storage.from('derived').getPublicUrl(path).data.publicUrl;

  const inbox = await client
    .from('photo_inbox')
    .insert({ portal_id: portal.id, listing_id: portal.listing_id, url: publicUrl, path, width, height });
  if (inbox.error) {
    // The file is orphaned rather than published; remove it so it is not
    // reachable by anyone who guessed the name.
    await client.storage.from('derived').remove([path]);
    console.warn('phone_upload inbox_failed');
    return json({ error: 'unavailable' }, 502);
  }

  return json({ ok: true, sent: sent + 1, remaining: Math.max(0, MAX_IMAGES - sent - 1) }, 200);
};
