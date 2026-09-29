/**
 * Which picture URLs the editor's live preview may render.
 *
 * The preview route renders whatever the editor posts, and nothing it posts
 * is stored. What stops it being a way to put arbitrary content on our
 * origin is that it only draws images from places we already serve: the
 * public storage bucket, our own paths (fixtures, the homepage), and the
 * editor's own `blob:` URLs for photographs still uploading — those belong
 * to this origin and die with the tab. Anything else is dropped, which on
 * the page means the photograph is simply not there.
 */
export function allowedPreviewUrl(
  value: unknown,
  origin: string,
  storageOrigin: string | undefined,
): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (value.startsWith(`blob:${origin}/`)) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.origin !== origin) return undefined;
  if (url.origin === origin) return url.href;
  if (storageOrigin && url.origin === storageOrigin && url.pathname.startsWith('/storage/v1/object/public/')) {
    return url.href;
  }
  return undefined;
}

/** The body the editor posts is bounded; a draft is a few kilobytes. */
export const PREVIEW_MAX_BYTES = 256 * 1024;
