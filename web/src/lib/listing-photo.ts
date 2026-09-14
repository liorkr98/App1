import { supabase } from './supabase';

/**
 * Strips EXIF by re-encoding in a canvas, then uploads a public copy.
 *
 * Originals stay in the private bucket (GPS and all). Nothing from that
 * bucket is ever served to a buyer. The public URL is this derived file,
 * written under `{listingId}/browser/` — the only prefix the owner is
 * allowed to write in `derived` (migration 0012).
 *
 * Canvas re-encode is the EXIF strip. A File uploaded as-is would put the
 * seller's home coordinates on a world-readable URL.
 */
export async function stripAndUploadDerived(
  listingId: string,
  file: File,
  photoId: string,
): Promise<{ url: string; width: number; height: number } | { error: string }> {
  const stripped = await reencode(file);
  if ('error' in stripped) return stripped;

  const path = `${listingId}/browser/${photoId}.webp`;
  const { error } = await supabase().storage.from('derived').upload(path, stripped.blob, {
    contentType: stripped.blob.type,
    upsert: true,
  });

  if (error) return { error: error.message };

  const { data } = supabase().storage.from('derived').getPublicUrl(path);
  return { url: data.publicUrl, width: stripped.width, height: stripped.height };
}

async function reencode(
  file: File,
): Promise<{ blob: Blob; width: number; height: number } | { error: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { error: 'no_canvas' };
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/webp', 0.82);
    });

    if (!blob) return { error: 'encode_failed' };
    return { blob, width, height };
  } catch {
    return { error: 'decode_failed' };
  }
}
