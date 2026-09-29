/**
 * Which cover URL the depth job may fetch.
 *
 * listings.media is written by the owner's own browser (saveListing), so the
 * cover URL on the row is client-supplied. Fetching whatever it says from a
 * process holding the service-role key is the SSRF CLAUDE.md §9 warns about.
 * Only a public object in OUR storage project's `derived` bucket — where the
 * editor's re-encoded, EXIF-free copies live — is fetched.
 */
export function publicDerivedUrl(value: unknown, supabaseUrl: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  let url: URL;
  let base: URL;
  try {
    url = new URL(value);
    base = new URL(supabaseUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || url.origin !== base.origin) return undefined;
  if (!url.pathname.startsWith('/storage/v1/object/public/derived/')) return undefined;
  if (url.pathname.includes('..') || url.username || url.password) return undefined;
  return url.href;
}
