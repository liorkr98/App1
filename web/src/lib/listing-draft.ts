import { DEFAULT_ACCENT, isAccentId } from '@/features/agents/accents';
import { toSeller } from '@/features/agents/profile';
import { generateSlug } from '@/features/listings/slug';
import { schemaFor, type ListingCategory } from '@/features/listings/schemas';

import { loadProfile } from './profile';
import { supabase } from './supabase';

/**
 * The draft listing row, and why the editor needs one before it can upload.
 *
 * The storage policies in 0004 key every path off its first segment and
 * require a LISTING THAT EXISTS AND IS YOURS:
 *
 *   with check (... l.id::text = (storage.foldername(name))[1]
 *                and l.owner_id = auth.uid())
 *
 * So a photo cannot be uploaded before its listing has a row. That ordering is
 * not an inconvenience to route around — it is what stops one signed-in user
 * writing into another's folder, and it is enforced by the database rather
 * than by this file.
 *
 * It also happens to fix the other half of the agent's complaint. A draft that
 * exists server-side is a draft that survives a lost phone, and one that can
 * be edited later without the link changing.
 */

export interface DraftRow {
  id: string;
  slug: string;
}

/**
 * Creates a draft listing owned by the signed-in user, retrying on a slug
 * collision.
 *
 * The retry is not defensive padding. Five Crockford characters is a space of
 * 33,554,432, and the birthday maths puts a collision at roughly 1.5% by a
 * THOUSAND listings and near-certain by 26,000 — against a primary audience of
 * 22,995 licensed brokers. The unique index in 0002 is load bearing, so
 * generation has to expect to lose sometimes.
 */
export async function createDraft(category: ListingCategory): Promise<DraftRow> {
  const client = supabase();

  const { data: session } = await client.auth.getSession();
  const owner = session.session?.user.id;
  if (!owner) throw new Error('not signed in');

  const randomBytes = (count: number) => crypto.getRandomValues(new Uint8Array(count));

  /*
   * The agent's own details, stamped onto the row at creation.
   *
   * WHY A COPY AND NOT A JOIN. `listings.seller` is jsonb rather than a
   * foreign key to `profiles`, deliberately: an agent who moves agency next
   * year must not silently rewrite the pages they already sent. Those pages
   * are a record of what was true when they were published, and a buyer who
   * saved one is entitled to see the same page tomorrow. The provenance
   * argument the facts grid makes applies to the seller block too.
   *
   * A MISSING OR INCOMPLETE PROFILE IS NOT AN ERROR HERE. The seller column
   * defaults to an empty object and the editor's own blockers are what stop a
   * listing being published without one — the same shape as `title` and
   * `price` above, which are inserted empty for exactly this reason. Failing
   * draft creation because someone has not filled in /me yet would lose them
   * the photographs they came to upload.
   *
   * STAMPED AGAIN AT PUBLISH, once publish exists. An agent who fixes their
   * phone number after starting a draft should not have to start over, and
   * this row was written before that correction.
   */
  const stamped = await stampFromProfile(category);

  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = generateSlug(randomBytes);

    const { data, error } = await client
      .from('listings')
      .insert({
        owner_id: owner,
        slug,
        category,
        // NOT NULL columns with no default. A draft has neither yet, and the
        // editor's own blockers are what stop it being published empty — the
        // database only needs a row it can hang photos off.
        title: '',
        price: 0,
        ...(stamped.seller ? { seller: stamped.seller } : {}),
        accent: stamped.accent,
      })
      .select('id, slug')
      .single();

    if (!error && data) return { id: data.id as string, slug: data.slug as string };

    // 23505 is unique_violation. Anything else is a real failure and retrying
    // it would just be slower.
    if (error?.code !== '23505') throw error ?? new Error('insert failed');
    lastError = error;
  }

  throw lastError ?? new Error('could not allocate a slug');
}

/**
 * The signed-in agent's details as a `Seller`, plus their accent.
 *
 * Undefined covers three different situations on purpose — not signed in, no
 * profile row, a profile too incomplete to dial — because the caller does the
 * same thing with all three: leave the column at its default and let the
 * editor's blockers ask for what is missing at the point where it can be
 * fixed. Distinguishing them here would only let a draft fail for a reason
 * the seller cannot act on while holding a phone full of photographs.
 */
async function stampFromProfile(category: ListingCategory) {
  try {
    const result = await loadProfile();
    if (!('profile' in result)) return { seller: undefined, accent: DEFAULT_ACCENT };

    const { profile } = result;

    return {
      seller: toSeller(profile, schemaFor(category).ownerRole),
      // The accent is stamped even when the seller is not. A half-filled
      // profile still has a colour, and the listing should carry it.
      accent: isAccentId(profile.accent) ? profile.accent : DEFAULT_ACCENT,
    };
  } catch {
    // A profile read that throws must not take the draft with it. The
    // photographs are the thing the seller came to save.
    return { seller: undefined, accent: DEFAULT_ACCENT };
  }
}

/** Where one photo lives. The first segment MUST be the listing id. */
export function originalPath(listingId: string, fileName: string): string {
  // The seller's own filename is not trusted for a storage key: it can carry
  // slashes, which would place the object outside the listing's folder and
  // straight past the policy's first-segment check.
  const safe = fileName.replace(/[^\w.-]+/g, '-').slice(-80);
  return `${listingId}/${Date.now()}-${safe}`;
}

/**
 * Uploads one original.
 *
 * Into `originals`, which is PRIVATE — it holds what the phone produced, EXIF
 * and GPS included. Nothing here is ever served to a buyer; the pipeline
 * strips metadata and writes the public copy into `derived` (0004).
 */
export async function uploadOriginal(
  listingId: string,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const path = originalPath(listingId, file.name);

  const { error } = await supabase()
    .storage.from('originals')
    .upload(path, file, { contentType: file.type, upsert: false });

  return error ? { error: error.message } : { path };
}
