import { db } from '../db.js';
import { listingDerivedPath } from '../depth/allow.js';
import { env } from '../env.js';
import { parseReviewAnswer } from '../photo-review.js';
import { JobFailure, type JobContext } from '../types.js';

/**
 * review_photos: one pass over the listing's public photographs, through
 * DeepSeek. The same key as the description. The editor normally asks
 * /api/photo-review itself; this drain is for a job already sitting in the
 * queue. Nothing here writes listings.media.
 *
 * The prompt matches src/features/listings/photo-review.ts. This package
 * cannot import that file.
 */

const MODEL = 'deepseek-flash';
const ENDPOINT = (process.env.DEEPSEEK_API_URL ?? 'https://api.deepseek.com/v1/chat/completions').replace(/\/+$/, '');

const SYSTEM = [
  'You label one real-estate photograph. Reply with json only.',
  'Example: {"room":"kitchen","confidence":0.8,"issues":["dark"],"tip":"turnOnLight","score":3}',
  'room: living, kitchen, bedroom, bathroom, balcony, outdoor, or other.',
  'confidence: a number from 0 to 1.',
  'issues: any of dark, blurry, tilted, sideways, portraitCover, clutter, person, documents, plate, blownWindow, tooClose.',
  'tip: one of openCurtain, stepBack, turnOnLight, straighten, retake, hidePlate, clearClutter.',
  'score: an integer from 1 to 5. 5 is the best cover photograph.',
].join(' ');

function photoUrls(media: unknown): string[] {
  if (typeof media !== 'object' || media === null) return [];
  const record = media as { cover?: { url?: unknown }; gallery?: { url?: unknown }[] };
  const urls = [record.cover?.url, ...(record.gallery ?? []).map((item) => item.url)];
  return urls.filter((url): url is string => typeof url === 'string');
}

async function ask(imageUrl: string): Promise<unknown> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new JobFailure('deepseek_unavailable', true);
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        model: MODEL,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        max_tokens: 300,
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Label this photograph.' },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
            ],
          },
        ],
      }),
    });
  } catch {
    throw new JobFailure('deepseek_unavailable', true);
  }
  if (!response.ok) throw new JobFailure('deepseek_unavailable', true);
  const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  return body.choices?.[0]?.message?.content;
}

export async function reviewPhotos({ job, progress }: JobContext): Promise<Record<string, unknown>> {
  const { data: row, error } = await db().from('listings').select('media').eq('id', job.listing_id).single();
  if (error || !row) throw new JobFailure('listing_unavailable', true);

  const paths = photoUrls(row.media).flatMap((url) => {
    const path = listingDerivedPath(url, env.supabaseUrl, job.listing_id);
    return path ? [{ url, path }] : [];
  });

  let reviewed = 0;
  let skipped = 0;
  for (const [index, photo] of paths.entries()) {
    const parsed = parseReviewAnswer(await ask(photo.url));
    if (!parsed) {
      skipped += 1;
      continue;
    }

    const written = await db().rpc('attach_photo_review', {
      p_listing_id: job.listing_id,
      p_photo_path: photo.path,
      p_room: parsed.room ?? null,
      p_room_confidence: parsed.confidence ?? null,
      p_issues: parsed.issues,
      p_tip: parsed.tip ?? null,
      p_score: parsed.score ?? null,
    });
    if (written.error) throw new JobFailure('review_not_stored', true);
    reviewed += 1;
    await progress(Math.round(((index + 1) / paths.length) * 100));
  }

  return { reviewed, skipped };
}
