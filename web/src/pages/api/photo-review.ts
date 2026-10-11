import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { listingBrowserPath } from '@/features/listings/derived-photo';
import {
  parsePhotoReview,
  PHOTO_REVIEW_SYSTEM,
  PHOTO_REVIEW_USER,
} from '@/features/listings/photo-review';

import { deepseekVision } from '../../lib/deepseek';
import { supabaseAsUser, supabaseConfigured, supabaseUrl } from '../../lib/supabase';

/**
 * POST /api/photo-review — DeepSeek looks at one photograph of this listing.
 *
 * Same secret as the description (`DEEPSEEK_API_KEY`), and the same rule:
 * the key stays on the Worker. The browser sends a listing id and its own
 * access token. The photograph is read from the row, and only a public file
 * in that listing's browser/ folder is sent.
 *
 * One picture per request, so a slow answer cannot hold the editor open
 * across the whole gallery. The caller repeats while `remaining` falls.
 * A picture that does not parse is still recorded, empty, so the next
 * request moves on. No key and no answer leave the row unwritten, and
 * neither one blocks publish.
 *
 * NOT A PAGE-RENDER FETCH. The published page never calls this.
 */
export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function photoUrls(media: unknown): string[] {
  if (typeof media !== 'object' || media === null) return [];
  const record = media as { cover?: { url?: unknown }; gallery?: { url?: unknown }[] };
  const urls = [record.cover?.url, ...(record.gallery ?? []).map((item) => item.url)];
  return urls.filter((url): url is string => typeof url === 'string');
}

export const POST: APIRoute = async ({ request }) => {
  if (!supabaseConfigured) return json({ error: 'not_configured' }, 503);

  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);

  let listingId = '';
  try {
    const body = (await request.json()) as { listingId?: unknown };
    listingId = typeof body.listingId === 'string' ? body.listingId : '';
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!listingId) return json({ error: 'bad_request' }, 400);

  const client = supabaseAsUser(token);
  const { data, error } = await client.from('listings').select('id, media').eq('id', listingId).maybeSingle();
  if (error) return json({ error: 'unavailable' }, 502);
  if (!data) return json({ error: 'not_found' }, 404);

  const photos = photoUrls((data as { media?: unknown }).media).flatMap((url) => {
    const path = listingBrowserPath(url, supabaseUrl, listingId);
    return path ? [{ url, path }] : [];
  });

  const existing = await client.from('photo_reviews').select('photo_path').eq('listing_id', listingId);
  if (existing.error) return json({ error: 'unavailable' }, 502);
  const seen = new Set(
    (Array.isArray(existing.data) ? existing.data : []).map((row) => String((row as { photo_path?: unknown }).photo_path ?? '')),
  );
  const pending = photos.filter((photo) => !seen.has(photo.path));
  const next = pending[0];
  if (!next) return json({ reviewed: 0, remaining: 0 }, 200);

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('deepseek no_key');
    return json({ reviewed: 0, remaining: pending.length, reason: 'no_key' }, 200);
  }

  const raw = await deepseekVision({
    apiKey,
    system: PHOTO_REVIEW_SYSTEM,
    user: PHOTO_REVIEW_USER,
    imageUrl: next.url,
  });
  if (!raw) return json({ reviewed: 0, remaining: pending.length, reason: 'no_answer' }, 200);

  const parsed = parsePhotoReview(raw);
  const written = await client.rpc('attach_own_photo_review', {
    p_listing_id: listingId,
    p_photo_path: next.path,
    p_room: parsed?.room ?? null,
    p_room_confidence: parsed?.confidence ?? null,
    p_issues: parsed?.issues ?? [],
    p_tip: parsed?.tip ?? null,
    p_score: parsed?.score ?? null,
  });
  if (written.error) return json({ error: 'unavailable' }, 502);

  return json({ reviewed: parsed ? 1 : 0, remaining: pending.length - 1 }, 200);
};
