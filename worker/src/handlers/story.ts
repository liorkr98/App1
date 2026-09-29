import { createHash } from 'node:crypto';

import puppeteer, { type Browser } from 'puppeteer';
import sharp from 'sharp';

import { env } from '../env.js';
import { listingPdfUrl } from '../pdf/url.js';
import { attachMediaUrl } from '../rpc.js';
import { upload } from '../storage.js';
import { JobFailure, type JobContext } from '../types.js';

/**
 * render_story (P7): the 1080 × 1920 story image of a published listing.
 *
 * Like render_pdf it drives a real browser against OUR page —
 * /a/{slug}/story/, which lays the frame out with the listing's own fonts,
 * <bdi> numbers and template mode — and screenshots it. Same process group
 * (Puppeteer), same SSRF guard: listingPdfUrl allows PAGE_BASE_URL's origin
 * only and the path comes from a fixed map, never the payload.
 *
 * The content hash goes in the FILENAME (CLAUDE.md §6): a status forwarded a
 * week ago must not silently change, and an edited listing gets a new file.
 */
const WIDTH = 1080;
const HEIGHT = 1920;
const NAVIGATION_TIMEOUT_MS = 45_000;

interface StoryPayload {
  slug?: string;
  baseUrl?: string;
}

export async function renderStory({ job, progress }: JobContext): Promise<Record<string, unknown>> {
  const { slug, baseUrl } = job.payload as StoryPayload;
  const url = listingPdfUrl({
    slug,
    pageBaseUrl: env.pageBaseUrl,
    ...(typeof baseUrl === 'string' ? { baseUrl } : {}),
    page: 'story',
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
    await progress(50);

    const png = await tab.screenshot({ type: 'png', clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
    const webp = await sharp(Buffer.from(png)).webp({ quality: 84 }).toBuffer();
    await progress(80);

    const hash = createHash('sha256').update(webp).digest('hex').slice(0, 8);
    const { publicUrl } = await upload(`${job.listing_id}/story/${slug}-${hash}.webp`, webp, 'image/webp');
    await attachMediaUrl(job.listing_id, 'storyUrl', publicUrl);
    await progress(100);

    return { url: publicUrl, bytes: webp.byteLength };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
