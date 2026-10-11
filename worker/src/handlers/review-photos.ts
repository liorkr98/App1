import sharp from 'sharp';

import { db } from '../db.js';
import { listingDerivedPath } from '../depth/allow.js';
import { env } from '../env.js';
import { parseReviewAnswer } from '../photo-review.js';
import { JobFailure, type JobContext } from '../types.js';

/**
 * review_photos: one pass over the listing's public photographs, on the
 * owner's Mac, through Ollama. Nothing here writes listings.media, and an
 * answer that does not parse is skipped.
 *
 * Expect 30–90s a photograph. Measure the first run; do not assume it.
 */

const MODEL = process.env.OLLAMA_MODEL ?? 'gemma3:4b';
const OLLAMA = (process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');

const PROMPT = [
  'Label this real-estate photograph. Reply with JSON only.',
  'room: living, kitchen, bedroom, bathroom, balcony, outdoor, or other.',
  'confidence: a number from 0 to 1.',
  'issues: any of dark, blurry, tilted, sideways, portraitCover, clutter, person, documents, plate, blownWindow, tooClose.',
  'tip: one of openCurtain, stepBack, turnOnLight, straighten, retake, hidePlate, clearClutter.',
  'score: an integer from 1 to 5. 5 is the best cover photograph.',
].join(' ');

const FORMAT = {
  type: 'object',
  properties: {
    room: { type: 'string' },
    confidence: { type: 'number' },
    issues: { type: 'array', items: { type: 'string' } },
    tip: { type: 'string' },
    score: { type: 'integer' },
  },
  required: ['issues', 'score'],
};

function photoUrls(media: unknown): string[] {
  if (typeof media !== 'object' || media === null) return [];
  const record = media as { cover?: { url?: unknown }; gallery?: { url?: unknown }[] };
  const urls = [record.cover?.url, ...(record.gallery ?? []).map((item) => item.url)];
  return urls.filter((url): url is string => typeof url === 'string');
}

async function ask(image: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        model: MODEL,
        think: false,
        stream: false,
        format: FORMAT,
        messages: [{ role: 'user', content: PROMPT, images: [image] }],
      }),
    });
  } catch {
    throw new JobFailure('ollama_unavailable', true);
  }
  if (!response.ok) throw new JobFailure('ollama_unavailable', true);
  const body = (await response.json()) as { message?: { content?: unknown } };
  return body.message?.content;
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
    let bytes: Buffer;
    try {
      const response = await fetch(photo.url);
      if (!response.ok) {
        skipped += 1;
        continue;
      }
      bytes = Buffer.from(await response.arrayBuffer());
    } catch {
      skipped += 1;
      continue;
    }

    const shrunk = await sharp(bytes)
      .rotate()
      .resize(768, 768, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const parsed = parseReviewAnswer(await ask(shrunk.toString('base64')));
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
