import type { EditorState } from '@/features/listings/editor';
import { DEFAULT_ACCENT, isAccentId } from '@/features/agents/accents';
import { toSeller } from '@/features/agents/profile';
import { schemaFor } from '@/features/listings/schemas';
import type { EditorPhoto } from '../components/editor/PhotosStep';

import { loadProfile } from './profile';
import { supabase } from './supabase';

/**
 * Writing the editor's state back to the listing row.
 *
 * THIS DID NOT EXIST, AND THAT WAS THE PRODUCT'S LARGEST HOLE.
 *
 * `createDraft` inserted a row with `title: ''` and `price: 0` so the
 * photographs had somewhere to hang, and NOTHING EVER UPDATED IT. Facts,
 * description, template, title, price, location, media — all of it lived in
 * localStorage and died with the browser profile. The dashboard read the row
 * and correctly reported an empty listing, which is what it was.
 *
 * Everything here is an UPDATE on a row that already exists. The insert stays
 * in listing-draft.ts, which owns slug allocation and its retry.
 *
 * NO OWNER FILTER, on purpose. The update policy in 0002 restricts this to the
 * agent's own rows. A `.eq('owner_id', …)` here would LOOK like the security
 * and quietly become the security the day somebody edits the policy.
 */

/** What the page needs to render one photograph. */
export interface SavedPhoto {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
}

/**
 * The media column's shape, matching `Media` in @/types/listing.
 *
 * The FIRST photo is the cover, because that is the frame the WhatsApp card
 * is cut from and the order the seller arranged is the order they meant
 * (CLAUDE.md §4.4 — in RTL the first item is the rightmost).
 */
function toMedia(photos: readonly SavedPhoto[]) {
  const [cover, ...rest] = photos;
  if (!cover) return {};

  return {
    cover: { id: cover.id, url: cover.url, alt: cover.alt, width: cover.width, height: cover.height },
    gallery: rest.map((photo) => ({
      id: photo.id,
      url: photo.url,
      alt: photo.alt,
      width: photo.width,
      height: photo.height,
    })),
  };
}

/**
 * Saves everything the editor knows.
 *
 * Called on every step change rather than on a timer. A step boundary is the
 * moment a seller has finished saying something, and it is also the moment
 * they might close the tab — an agent between viewings does not come back to
 * a form, they come back to a link.
 *
 * Returns the error rather than throwing. A failed save must not take down
 * the editor: the draft is still in localStorage, the seller can keep
 * working, and the next step boundary tries again.
 */
export async function saveListing(
  listingId: string,
  state: EditorState,
  photos: readonly EditorPhoto[],
): Promise<{ ok: true } | { error: string }> {
  const saved = photos
    .filter((photo): photo is EditorPhoto & { publicUrl: string } => Boolean(photo.publicUrl))
    .map((photo, index) => ({
      id: photo.id,
      url: photo.publicUrl,
      // The seller has not been asked for alt text yet. An empty string is
      // the correct value for "nobody wrote one" — inventing a description
      // from the file name would be worse than silence to a screen reader.
      alt: '',
      // Recorded at upload, so the page can reserve the box before the bytes
      // arrive. Zero would produce a CLS penalty on every listing.
      width: photo.width ?? 0,
      height: photo.height ?? 0,
      index,
    }));

  const { error } = await supabase()
    .from('listings')
    .update({
      title: state.title,
      price: state.price,
      description: state.description,
      facts: state.facts,
      media: toMedia(saved),
      // Omitted keys would leave the previous value; an explicitly null
      // location is how a seller removes a street they changed their mind
      // about.
      location:
        state.city || state.street
          ? { city: state.city ?? '', ...(state.street ? { street: state.street } : {}) }
          : null,
      price_note: state.priceNote?.trim() ? state.priceNote.trim() : null,
      ...(state.template ? { template: state.template } : {}),
      ...(state.audience ? { audience: state.audience } : {}),
      ...(state.disclosures ? { disclosures: state.disclosures } : {}),
      indexable: state.indexable === true,
    })
    .eq('id', listingId);

  return error ? { error: error.message } : { ok: true };
}

/**
 * Publishes the listing.
 *
 * ============================ HUMAN REVIEW ============================
 * CLAUDE.md §8: the paywall may be built here and ENTITLEMENT MAY NOT BE
 * DECIDED here. This function does not read, infer or grant entitlement. It
 * flips `status` and stamps `published_at`, and the ONLY thing that decides
 * whether it is called is `canPublish` in the shared domain, which fails
 * closed on anything that is not 'paid'.
 *
 * There is no branch here that publishes on an error, and there must never
 * be one.
 * ======================================================================
 */
export async function publishListing(
  listingId: string,
  state: EditorState,
): Promise<{ ok: true; slug: string } | { error: string }> {
  // ============================ HUMAN REVIEW ============================
  // This function does not read entitlement. The editor's `canPublish` is
  // what called it, and that already required 'paid'. A second check here
  // would be the same decision in two places; a missed one would be a grant.
  // ======================================================================
  const category = state.category;
  if (!category) return { error: 'no_category' };

  let seller: Record<string, unknown> | undefined;
  let accent: string = DEFAULT_ACCENT;

  try {
    const profile = await loadProfile();
    if ('profile' in profile) {
      const stamped = toSeller(profile.profile, schemaFor(category).ownerRole);
      if (stamped) seller = { ...stamped };
      if (isAccentId(profile.profile.accent)) accent = profile.profile.accent;
    }
  } catch {
    // Keep whatever was stamped at draft time rather than failing publish
    // because /me could not be read at this instant.
  }

  const expires = new Date();
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);

  const { data, error } = await supabase()
    .from('listings')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
      expires_at: expires.toISOString(),
      indexable: state.indexable === true,
      ...(seller ? { seller, accent } : {}),
    })
    .eq('id', listingId)
    .select('slug')
    .single();

  if (error || !data) return { error: error?.message ?? 'publish_failed' };
  return { ok: true, slug: data.slug as string };
}

/**
 * Loads a listing the agent already owns, for editing.
 *
 * The dashboard's edit button used to point at `/new/` with no id at all, so
 * it started a fresh listing rather than opening the one that was clicked.
 */
export async function loadListing(
  slug: string,
): Promise<{ row: Record<string, unknown> } | { error: string }> {
  const { data, error } = await supabase()
    .from('listings')
    .select('id, slug, category, title, price, price_note, description, facts, media, location, template, audience, disclosures, indexable, status')
    .eq('slug', slug)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'not found' };

  return { row: data as Record<string, unknown> };
}
