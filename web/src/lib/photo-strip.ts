import { coverAccent } from '@/features/agents/cover-accent';
import type { AccentId } from '@/features/agents/accents';
import { checkPixels, type PhotoCheck } from '@/features/listings/photo-quality';

/**
 * Turning a phone photograph into something a public page can show.
 *
 * WHY THIS RUNS IN THE BROWSER. The intended design (docs/PIPELINE.md) is a
 * Fly worker doing sharp/libvips resizing, EXIF stripping and the OG crop. It
 * does not exist, and until it does an agent's photographs go into the private
 * `originals` bucket and are never seen again — which is exactly what was
 * happening: five uploads, and a dashboard card reading "בלי תמונה".
 *
 * ============================== EXIF, AND WHY ==============================
 *
 * 0004 says, in as many words, that there is NO write policy on `derived` for
 * any client role, because a browser-written file could carry EXIF — and the
 * GPS in a photograph of somebody's home back onto a public URL. That comment
 * was right, and 0012 relaxes it only because of what happens below.
 *
 * THE RE-ENCODE IS THE GUARANTEE, NOT A PROMISE TO BE CAREFUL. The image is
 * decoded to pixels with createImageBitmap, drawn onto a canvas, and read back
 * out with toBlob. The output is constructed from pixel data alone; there is
 * no code path by which a byte of the original container — EXIF, GPS, maker
 * notes, thumbnails, ICC — reaches it. Stripping is not a step that can be
 * forgotten, because the metadata is never carried in the first place.
 *
 * The ORIGINAL still goes to the private bucket, EXIF and all, so the real
 * pipeline can reprocess properly when it exists.
 * ===========================================================================
 */

/*
 * A module of its own, with no Supabase import, because the upload-from-phone
 * page (pages/up.astro) needs this and nothing else: the phone should not
 * download the database client to shrink a photograph.
 */

/** The long edge of the public copy. */
const MAX_EDGE = 1600;

/** WebP at 0.72 — the quality the sample photographs were re-encoded at. */
const QUALITY = 0.72;

export interface ProcessedPhoto {
  blob: Blob;
  width: number;
  height: number;
  /** On-device quality measurement (features/listings/photo-quality). */
  check?: PhotoCheck;
  /** The accent this photograph suggests if it is the cover (cover-accent.ts). */
  tone?: AccentId;
}

/** The long edge the quality check is measured at. */
const CHECK_EDGE = 256;
/** Sharpness is measured on the centre of a copy this long… */
const DETAIL_EDGE = 1024;
/** …in a square this wide. */
const DETAIL_CROP = 384;

/**
 * Decodes, resizes and re-encodes. Returns undefined when the browser cannot
 * do it, rather than throwing — a photo that will not process must not take
 * the whole upload down with it.
 */
export async function stripAndResize(
  file: File,
  maxEdge: number = MAX_EDGE,
): Promise<ProcessedPhoto | undefined> {
  try {
    const bitmap = await createImageBitmap(file);

    const edge = maxEdge > 0 ? maxEdge : MAX_EDGE;
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return undefined;
    }

    context.drawImage(bitmap, 0, 0, width, height);

    // A second, tiny drawing for the quality check: dark, blurry, small,
    // a repeat. Nothing leaves the phone for it. A failure here only means
    // no advice for this photograph.
    let check: PhotoCheck | undefined;
    let tone: AccentId | undefined;
    try {
      const small = Math.min(1, CHECK_EDGE / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(3, Math.round(bitmap.width * small));
      const h = Math.max(3, Math.round(bitmap.height * small));
      const probe = document.createElement('canvas');
      probe.width = w;
      probe.height = h;
      const pctx = probe.getContext('2d', { willReadFrequently: true });
      if (pctx) {
        pctx.drawImage(bitmap, 0, 0, w, h);
        // Sharpness needs detail: the centre of a 1024px copy, 384px square.
        const at = Math.min(1, DETAIL_EDGE / Math.max(bitmap.width, bitmap.height));
        const dw = Math.round(bitmap.width * at);
        const dh = Math.round(bitmap.height * at);
        const side = Math.min(DETAIL_CROP, dw, dh);
        const zoom = document.createElement('canvas');
        zoom.width = side;
        zoom.height = side;
        const zctx = zoom.getContext('2d', { willReadFrequently: true });
        let detail: { rgba: Uint8ClampedArray; width: number; height: number } | undefined;
        if (zctx && side >= 3) {
          zctx.drawImage(bitmap, -Math.round((dw - side) / 2), -Math.round((dh - side) / 2), dw, dh);
          detail = { rgba: zctx.getImageData(0, 0, side, side).data, width: side, height: side };
        }
        const pixels = pctx.getImageData(0, 0, w, h).data;
        check = checkPixels(pixels, w, h, bitmap, detail);
        // The same small copy says which offered accent the photo leans to.
        tone = coverAccent(pixels, w, h);
      }
    } catch {
      check = undefined;
    }
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', QUALITY),
    );

    return blob ? { blob, width, height, ...(check ? { check } : {}), ...(tone ? { tone } : {}) } : undefined;
  } catch {
    return undefined;
  }
}

