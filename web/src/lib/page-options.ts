import { cleanExtras, type ListingExtras } from '@/features/listings/page-extras';

import { supabase } from './supabase';

/**
 * The agent's page options (listings.extras, 0047), read and written apart
 * from the editor's save for the reason share-line.ts gives: the column
 * arrives with a migration the owner runs by hand, and a save that named it
 * before then would fail every save. Here a missing column only means the
 * options are not saved yet, which the editor says.
 */

export async function readExtras(listingId: string): Promise<ListingExtras | undefined> {
  try {
    const { data, error } = await supabase().from('listings').select('extras').eq('id', listingId).maybeSingle();
    if (error) return undefined;
    return cleanExtras((data as { extras?: unknown } | null)?.extras);
  } catch {
    return undefined;
  }
}

export async function saveExtras(listingId: string, extras: ListingExtras): Promise<boolean> {
  try {
    const { error } = await supabase().from('listings').update({ extras: cleanExtras(extras) }).eq('id', listingId);
    return !error;
  } catch {
    return false;
  }
}

/** A sold listing whose page stays up, or goes (0047). */
export async function saveSoldPublic(slug: string, soldPublic: boolean): Promise<boolean> {
  try {
    const { error } = await supabase().from('listings').update({ sold_public: soldPublic }).eq('slug', slug);
    return !error;
  } catch {
    return false;
  }
}
