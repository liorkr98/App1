import { createHash } from 'node:crypto';

import puppeteer, { type Browser } from 'puppeteer';

import { env } from '../env.js';
import { assertHebrewRenders, PdfMissingHebrew } from '../pdf/verify.js';
import { attachPdf } from '../rpc.js';
import { upload } from '../storage.js';
import { JobFailure, type JobContext } from '../types.js';

/**
 * D5 — the printable listing.
 *
 * Renders the REAL page with a real browser rather than rebuilding the layout
 * in a PDF library. One template, two formats: a change to the page is a
 * change to the PDF, and there is no second implementation to drift.
 *
 * Runs alone in the `pdf` Fly process group (ADR 0001). Chrome is the only
 * thing in this system that routinely runs out of memory, and when it does it
 * takes its whole machine with it.
 */

const NAVIGATION_TIMEOUT_MS = 45_000;

interface PdfPayload {
  slug?: string;
  /** Overrides PAGE_BASE_URL. Used to render a preview before publishing. */
  baseUrl?: string;
}

export async function renderPdf({ job, progress }: JobContext): Promise<Record<string, unknown>> {
  const { slug, baseUrl } = job.payload as PdfPayload;

  if (!slug) {
    throw new JobFailure('no_slug', false);
  }

  const root = (baseUrl ?? env.pageBaseUrl).replace(/\/+$/, '');
  const url = `${root}/a/${encodeURIComponent(slug)}/`;

  let browser: Browser | undefined;

  try {
    browser = await puppeteer.launch({
      args: [
        // Required in a container: Chrome's own sandbox needs user namespaces
        // that Fly's runtime does not grant. The container is the boundary
        // instead — unprivileged user, no shell, nothing on disk worth taking.
        //
        // It is NOT nothing, though. This process holds the service-role key
        // in its environment, and it renders pages containing seller-supplied
        // text. A renderer escape would reach that key. Flagged rather than
        // waved away; the fix is a scoped key, which Supabase does not offer
        // today. See docs/PIPELINE.md.
        '--no-sandbox',
        '--disable-dev-shm-usage', // /dev/shm is small in a container
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

    const response = await page.goto(url, { waitUntil: 'networkidle0' });

    if (!response?.ok()) {
      // A 404 here means the page is not published yet. Permanent: retrying
      // four times will not publish it.
      throw new JobFailure('page_unavailable', false);
    }

    await progress(40);

    await page.emulateMediaType('print');

    // Chrome will happily print before the webfonts arrive, and the result is
    // a PDF set in the fallback face — which for Hebrew is often no face at
    // all. This is the difference between a correct file and a page of boxes.
    //
    // Passed as a string rather than a closure on purpose: the worker compiles
    // without the DOM lib (it is a Node service, and pulling browser globals
    // into its type environment to satisfy one line would be the tail wagging
    // the dog). `.then(() => true)` because a FontFaceSet does not serialise.
    //
    // fonts.ready resolves when loading FINISHES, success or failure, so a
    // Google Fonts outage does not hang the render — it falls through to the
    // Noto Hebrew installed in the image, which is why that package is there.
    await page.evaluate('document.fonts.ready.then(() => true)');

    const pdf = await page.pdf({
      format: 'a4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
    });

    await progress(70);

    // Read our own output back before publishing it. See pdf/verify.ts for
    // why this is the check that matters.
    const check = await assertHebrewRenders(pdf);
    await progress(85);

    const hash = createHash('sha256').update(pdf).digest('hex').slice(0, 8);
    const { publicUrl } = await upload(
      `${job.listing_id}/pdf/${slug}-${hash}.pdf`,
      Buffer.from(pdf),
      'application/pdf',
    );

    await attachPdf(job.listing_id, publicUrl);
    await progress(100);

    return {
      url: publicUrl,
      bytes: pdf.byteLength,
      hebrewFound: check.hebrewFound,
      sentinelFound: check.sentinelFound,
      characters: check.characters,
    };
  } catch (error) {
    if (error instanceof JobFailure) throw error;

    if (error instanceof PdfMissingHebrew) {
      // Permanent, and deliberately loud. Retrying renders the same boxes;
      // what has to change is the image's fonts or the page's font loading.
      throw new JobFailure('pdf_missing_hebrew', false);
    }

    // A Chrome crash, an OOM or a navigation timeout. All worth one more go.
    throw new JobFailure('pdf_render_failed', true);
  } finally {
    // Not optional. A leaked browser holds several hundred megabytes on a
    // machine capped at one gigabyte, so the second leak is the last job this
    // instance ever runs.
    await browser?.close().catch(() => undefined);
  }
}
