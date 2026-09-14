import { supabase } from './supabase';

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

/** The long edge of the public copy. */
const MAX_EDGE = 1600;

/** WebP at 0.72 — the quality the sample photographs were re-encoded at. */
const QUALITY = 0.72;

export interface ProcessedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

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
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', QUALITY),
    );

    return blob ? { blob, width, height } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Uploads the public copy and returns its URL.
 *
 * The path's FIRST SEGMENT IS THE LISTING ID, which is what every storage
 * policy keys off (0004). The filename is not the seller's: their filename can
 * carry slashes, which would place the object outside the listing's folder and
 * straight past the policy's first-segment check.
 */
export async function uploadDerived(
  listingId: string,
  photoId: string,
  processed: ProcessedPhoto,
): Promise<{ url: string } | { error: string }> {
  const client = supabase();
  const path = `${listingId}/${photoId}.webp`;

  const { error } = await client.storage.from('derived').upload(path, processed.blob, {
    contentType: 'image/webp',
    // A seller who replaces a photograph keeps the same id, and the second
    // upload must win rather than fail.
    upsert: true,
    cacheControl: '31536000',
  });

  if (error) return { error: error.message };

  const { data } = client.storage.from('derived').getPublicUrl(path);
  return { url: data.publicUrl };
}
