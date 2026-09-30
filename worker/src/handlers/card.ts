import { createHash } from 'node:crypto';

import puppeteer, { type Browser } from 'puppeteer';
import sharp from 'sharp';

import { env } from '../env.js';
import { listingPdfUrl } from '../pdf/url.js';
import { attachMediaUrl } from '../rpc.js';
import { upload } from '../storage.js';
import { JobFailure, type JobContext } from '../types.js';

/**
 * render_card: the designed WhatsApp card (1200 × 630) of a published
 * listing, in its template (web/src/components/ShareCard.astro).
 *
 * Same shape as render_story: a real browser against OUR page, the path from
 * a fixed map and the origin PAGE_BASE_URL's alone (SSRF guard in
 * pdf/url.ts), the content hash in the FILENAME (CLAUDE.md §6).
 *
 * The card page prints <meta name="card-key">, a key over what the card
 * shows. It is stored beside the URL, and the listing page advertises the
 * card only while its own key still matches — so a card made before an edit
 * is never shown after it (src/features/listings/share-card.ts).
 *
 * CLAUDE.md §6: WebP, under 300 KB, absolute URL. The same quality ladder as
 * generate_og; if even the last step is over, it still ships — an oversize
 * card is a card, a failed job is no card at all.
 */
const WIDTH = 1200;
const HEIGHT = 630;
const MAX_BYTES = 300 * 1024;
const QUALITY_STEPS = [84, 74, 64, 54] as const;
const NAVIGATION_TIMEOUT_MS = 45_000;
const KEY_PATTERN = /^[0-9a-f]{8}$/;

interface CardPayload {
  slug?: string;
  baseUrl?: string;
}

export async function renderCard({ job, progress }: JobContext): Promise<Record<string, unknown>> {
  const { slug, baseUrl } = job.payload as CardPayload;
  const url = listingPdfUrl({
    slug,
    pageBaseUrl: env.pageBaseUrl,
    ...(typeof baseUrl === 'string' ? { baseUrl } : {}),
    page: 'card',
  });
  if (!url) {
    throw new JobFailure(slug ? 'url_not_allowed' : 'no_slug', false);
  }

  let browser: Browser | undefined;
  try {
    // The same flags as render_pdf, for the same reasons written there.
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    const tab = await browser.newPage();
    tab.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
    await tab.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });

    const response = await tab.goto(url, { waitUntil: 'networkidle0' });
    if (!response?.ok()) {
      throw new JobFailure('page_unavailable', false);
    }
    await tab.evaluate('document.fonts.ready.then(() => true)');
    const key = await tab.evaluate(
      "document.querySelector('meta[name=\"card-key\"]')?.getAttribute('content') ?? ''",
    );
    if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
      throw new JobFailure('no_card_key', false);
    }
    await progress(50);

    const png = await tab.screenshot({ type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
    const base = sharp(Buffer.from(png));
    const [best, ...fallbacks] = QUALITY_STEPS;
    let webp = await base.clone().webp({ quality: best }).toBuffer();
    for (const quality of fallbacks) {
      if (webp.byteLength <= MAX_BYTES) break;
      webp = await base.clone().webp({ quality }).toBuffer();
    }
    await progress(80);

    const hash = createHash('sha256').update(webp).digest('hex').slice(0, 8);
    const { publicUrl } = await upload(`${job.listing_id}/card/${slug}-${hash}.webp`, webp, 'image/webp');
    await attachMediaUrl(job.listing_id, 'card', { url: publicUrl, key });
    await progress(100);

    return { url: publicUrl, key, bytes: webp.byteLength };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
