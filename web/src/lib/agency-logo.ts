import { stripAndResize } from './listing-photo';
import { supabase } from './supabase';

/**
 * The agency mark, stored once per agent rather than once per listing.
 *
 * Path: `{user_id}/logo.webp`. The branding bucket (0015) keys the first
 * segment on auth.uid(), same shape as a listing folder but a different
 * table — a logo is not a photograph of someone's home, and putting it in
 * `derived` would need a fake listing id, which is how a path check gets
 * walked around.
 *
 * THE SAME PATH ON REPLACE. cacheControl is an hour, not a year: the object
 * name does not change, so a long cache would keep serving a mark the agent
 * already swapped. WhatsApp does not cache this the way it caches og:image;
 * the listing page's <img> is what has to notice.
 *
 * EXIF is stripped by the canvas re-encode, same guarantee as 0012. The
 * original is not kept.
 */

const BUCKET = 'branding';
const FILENAME = 'logo.webp';
const MAX_EDGE = 512;
const CACHE_CONTROL = '3600';

function logoPath(userId: string): string {
  // The filename is ours. A seller-supplied name can carry slashes, which
  // would place the object outside their folder and past the policy's
  // first-segment check.
  return `${userId}/${FILENAME}`;
}

export async function uploadAgencyLogo(
  file: File,
): Promise<{ url: string } | { signedOut: true } | { error: string }> {
  const client = supabase();
  const { data: session } = await client.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return { signedOut: true };

  const processed = await stripAndResize(file, MAX_EDGE);
  if (!processed) return { error: 'process_failed' };

  const path = logoPath(userId);
  const { error: uploadError } = await client.storage.from(BUCKET).upload(path, processed.blob, {
    contentType: 'image/webp',
    upsert: true,
    cacheControl: CACHE_CONTROL,
  });

  if (uploadError) return { error: uploadError.message };

  const { data } = client.storage.from(BUCKET).getPublicUrl(path);
  const url = data.publicUrl;

  const { error: profileError } = await client
    .from('profiles')
    .update({ agency_logo_url: url })
    .eq('id', userId);

  // The object is already public if this fails. Returning an error is still
  // right: the page reads the column, not the bucket, and a silent success
  // here would show a preview that publish would not stamp.
  if (profileError) return { error: profileError.message };

  return { url };
}

export async function removeAgencyLogo(): Promise<
  { ok: true } | { signedOut: true } | { error: string }
> {
  const client = supabase();
  const { data: session } = await client.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return { signedOut: true };

  const { error: removeError } = await client.storage.from(BUCKET).remove([logoPath(userId)]);
  if (removeError) return { error: removeError.message };

  const { error: profileError } = await client
    .from('profiles')
    .update({ agency_logo_url: null })
    .eq('id', userId);

  if (profileError) return { error: profileError.message };

  return { ok: true };
}
