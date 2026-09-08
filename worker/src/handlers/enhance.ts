import sharp from 'sharp';

import { enhanceAdvanced } from '../enhance/advanced.js';
import { DERIVED, downloadOriginal, stripMetadata, upload } from '../storage.js';
import { JobFailure, type JobContext } from '../types.js';

/**
 * D1 — image enhancement.
 *
 * Local sharp/libvips only. No external API in v1: at roughly $0.30–0.58 per
 * image (RESEARCH.md §7), a 15-image listing would cost about ₪16 before we
 * have charged anyone anything.
 *
 * Output widths match what the page's srcset asks for — see
 * web/src/lib/images.ts. If these lists ever disagree the page requests
 * variants that were never produced, and every image 404s.
 */
const WIDTHS = [400, 800, 1200, 1600] as const;
const WEBP_QUALITY = 82;

interface EnhancePayload {
  /** Paths inside the `originals` bucket. */
  sources?: string[];
}

export async function enhanceImages({ job, progress }: JobContext): Promise<Record<string, unknown>> {
  const { sources } = job.payload as EnhancePayload;

  if (!sources?.length) {
    throw new JobFailure('no_sources', false);
  }

  const produced: { source: string; variants: Record<number, string> }[] = [];

  for (const [index, source] of sources.entries()) {
    const original = await downloadOriginal(job.listing_id, source);

    // Tonal work only. Exposure, white balance and denoise are permitted and
    // need no label; anything GENERATIVE — staging, sky replacement, object
    // removal — would require a permanent "עבר עריכה" label and is not done
    // here (RESEARCH.md §3.3).
    const base = stripMetadata(sharp(original))
      .normalise() // auto contrast across the full range
      .modulate({ saturation: 1.04 }) // a touch of warmth, not a filter
      .sharpen({ sigma: 0.6 });

    const advanced = await enhanceAdvanced(base);

    const variants: Record<number, string> = {};
    const stem = source.replace(/\.[^.]+$/, '');

    for (const width of WIDTHS) {
      const body = await advanced
        .clone()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      // Matches the {base}-{width}.webp convention the page composes URLs
      // from. web/src/lib/images.ts is the other half of this contract.
      const { publicUrl } = await upload(`${stem}-${width}.webp`, body, 'image/webp');
      variants[width] = publicUrl;
    }

    produced.push({ source, variants });
    await progress(((index + 1) / sources.length) * 100);
  }

  return { bucket: DERIVED, images: produced };
}
