import type { APIRoute } from 'astro';

import { qrDrawing } from '../../lib/qr';
import { supabaseAsUser, supabaseConfigured } from '../../lib/supabase';

/**
 * POST /api/phone-portal — open an upload-from-phone code for one listing
 * (supabase/migrations/0036_phone_portal.sql), and draw its QR.
 *
 * The portal is made by `create_photo_portal` AS THE AGENT: their own token,
 * so the function's ownership check is the authorisation, exactly as if the
 * editor had called it directly.
 *
 * WHY THE QR IS DRAWN HERE. The encoder is ~20 KB, and the editor page sits
 * at the 900 KB budget (scripts/report-page-weight.mjs). Drawn on the server,
 * the editor downloads one SVG path instead of the library that makes it.
 *
 * The answer: `{ id, expiresAt, qr: { box, d } }`. The token itself is inside
 * the QR and nowhere else in the answer — the computer never needs it.
 */
export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export const POST: APIRoute = async ({ request, url }) => {
  if (!supabaseConfigured) return json({ error: 'not_configured' }, 503);
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthenticated' }, 401);

  let listingId = '';
  try {
    const body = (await request.json()) as { listingId?: unknown };
    listingId = typeof body.listingId === 'string' ? body.listingId : '';
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!listingId) return json({ error: 'bad_request' }, 400);

  const { data, error } = await supabaseAsUser(token).rpc('create_photo_portal', { p_listing_id: listingId });
  const made = data as { id?: unknown; token?: unknown; expiresAt?: unknown } | null;
  if (error || typeof made?.id !== 'string' || typeof made.token !== 'string' || typeof made.expiresAt !== 'string') {
    console.warn('phone_portal create_failed');
    return json({ error: 'unavailable' }, 502);
  }

  return json({ id: made.id, expiresAt: made.expiresAt, qr: qrDrawing(`${url.origin}/up/#${made.token}`) }, 200);
};
