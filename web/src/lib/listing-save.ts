import type { EditorState } from '@/features/listings/editor';
import { DEFAULT_ACCENT, isAccentId } from '@/features/agents/accents';
import { toSeller } from '@/features/agents/profile';
import { schemaFor } from '@/features/listings/schemas';

import { loadProfile } from './profile';
import { supabase } from './supabase';

/**
 * Writing the editor's state back to the listing row.
 *
 * Everything here is an UPDATE on a row that already exists. The insert stays
 * in listing-draft.ts, which owns slug allocation.
 *
 * NO OWNER FILTER, on purpose. The update policy in 0002 restricts this to
 * the agent's own rows.
 */

export interface SavedPhoto {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
}

function toMedia(photos: readonly SavedPhoto[]) {
  const [cover, ...rest] = photos;
  if (!cover) return {};

  return {
    cover: {
      id: cover.id,
      url: cover.url,
      alt: cover.alt,
      width: cover.width,
      height: cover.height,
    },
    gallery: rest.map((photo) => ({
      id: photo.id,
      url: photo.url,
      alt: photo.alt,
      width: photo.width,
      height: photo.height,
    })),
  };
}

function locationOf(state: EditorState) {
  const city = state.city?.trim();
  if (!city) return null;
  const street = state.street?.trim();
  return street ? { city, street } : { city };
}

/**
 * Saves everything the editor knows.
 *
 * Called on every step change rather than on a timer. Returns the error
 * rather than throwing: a failed save must not take down the editor.
 */
export async function saveListing(
  listingId: string,
  state: EditorState,
  photos: readonly SavedPhoto[],
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase()
    .from('listings')
    .update({
      title: state.title.trim(),
      price: state.price,
      ...(state.priceNote?.trim() ? { price_note: state.priceNote.trim() } : { price_note: null }),
      description: state.description,
      facts: state.facts,
      media: toMedia(photos),
      location: locationOf(state),
      ...(state.template ? { template: state.template } : {}),
      ...(state.audience ? { audience: state.audience } : {}),
      indexable: state.indexable === true,
      ...(state.disclosures && state.disclosures.length > 0
        ? { disclosures: state.disclosures }
        : { disclosures: null }),
    })
    .eq('id', listingId);

  return error ? { error: error.message } : { ok: true };
}

/**
 * Flips a ready draft to published, restamping the seller from /me.
 *
 * ============================ HUMAN REVIEW ============================
 * This function does not read entitlement. The editor's `canPublish` is what
 * called it, and that already required 'paid'. A second check here would be
 * the same decision in two places; a missed one would be a grant. Keep the
 * gate in editor.ts.
 * ======================================================================
 *
 * Job enqueue is a SEPARATE call (listing-jobs.ts). Publishing must succeed
 * even if the worker is down — a listing with unenhanced photos is still a
 * listing, and a failed job must never gate the link (docs/PIPELINE.md).
 */
export async function publishListing(
  listingId: string,
  state: EditorState,
): Promise<{ ok: true; slug: string } | { error: string }> {
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

export interface LoadedListing {
  id: string;
  slug: string;
  category: EditorState['category'];
  title: string;
  price: number;
  priceNote?: string;
  description: string;
  facts: EditorState['facts'];
  template?: EditorState['template'];
  audience?: EditorState['audience'];
  disclosures?: string[];
  city?: string;
  street?: string;
  indexable: boolean;
  status: string;
  photos: SavedPhoto[];
}

/**
 * Loads a listing the signed-in agent owns, for editing.
 *
 * RLS is the owner filter. Drafts are included: this is the editor, not the
 * public page.
 */
export async function loadListing(slug: string): Promise<LoadedListing | { error: string }> {
  const { data, error } = await supabase()
    .from('listings')
    .select(
      'id, slug, category, title, price, price_note, description, facts, media, location, template, audience, disclosures, indexable, status',
    )
    .eq('slug', slug)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'not_found' };

  const media = (data.media ?? {}) as {
    cover?: SavedPhoto;
    gallery?: SavedPhoto[];
  };
  const photos: SavedPhoto[] = [];
  if (media.cover?.url) photos.push(media.cover);
  if (Array.isArray(media.gallery)) {
    for (const item of media.gallery) {
      if (item?.url) photos.push(item);
    }
  }

  const location = data.location as { city?: string; street?: string } | null;

  return {
    id: data.id as string,
    slug: data.slug as string,
    category: data.category as EditorState['category'],
    title: String(data.title ?? ''),
    price: Number(data.price ?? 0),
    ...(typeof data.price_note === 'string' && data.price_note
      ? { priceNote: data.price_note }
      : {}),
    description: String(data.description ?? ''),
    facts: Array.isArray(data.facts) ? (data.facts as EditorState['facts']) : [],
    ...(typeof data.template === 'string' ? { template: data.template as EditorState['template'] } : {}),
    ...(typeof data.audience === 'string' ? { audience: data.audience as EditorState['audience'] } : {}),
    ...(Array.isArray(data.disclosures) ? { disclosures: data.disclosures as string[] } : {}),
    ...(location?.city ? { city: location.city } : {}),
    ...(location?.street ? { street: location.street } : {}),
    indexable: data.indexable === true,
    status: String(data.status ?? 'draft'),
    photos,
  };
}
