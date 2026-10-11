/**
 * A photograph the photo check may send to DeepSeek.
 *
 * The URL on the listing row is written by the browser. Only a public object
 * in this project's derived bucket, inside that listing's browser/ folder,
 * is handed to the model. Anything else is dropped.
 */

const MARKER = '/storage/v1/object/public/derived/';

export function listingBrowserPath(
  value: unknown,
  supabaseUrl: string,
  listingId: string,
): string | undefined {
  if (typeof value !== 'string' || listingId === '') return undefined;
  let url: URL;
  let base: URL;
  try {
    url = new URL(value);
    base = new URL(supabaseUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.origin !== base.origin) return undefined;
  if (url.username || url.password || url.pathname.includes('..')) return undefined;
  if (!url.pathname.startsWith(MARKER)) return undefined;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname.slice(MARKER.length));
  } catch {
    return undefined;
  }
  const folder = `${listingId}/browser/`;
  if (!path.startsWith(folder) || path.slice(folder.length).includes('/') || path.includes('..')) {
    return undefined;
  }
  return path;
}
