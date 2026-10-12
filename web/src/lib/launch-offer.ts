import { seatsLeft, type CohortCount } from '@/features/billing/seats';

import { supabase, supabaseConfigured } from './supabase';

/**
 * The launch price, shown only while a seat demonstrably remains
 * (docs/PRICING.md §6: never fake scarcity). Static pages render the
 * regular price; this reads the real `cohort_counters` and switches
 * `[data-card]` cards to their launch variant. A full cohort, or a count it
 * could not read, leaves the regular price where it is.
 *
 * No i18n here on purpose: the homepage runs this, and the locale file is
 * the heaviest thing a page script can import (900 KB budget). The words
 * are rendered by the page; this only chooses which ones show.
 */
export async function readCounts(): Promise<CohortCount[] | null> {
  if (!supabaseConfigured) return null;
  try {
    const { data, error } = await supabase().from('cohort_counters').select('cohort, used, cap');
    return error || !Array.isArray(data) ? null : (data as CohortCount[]);
  } catch {
    return null;
  }
}

/** Swaps each `[data-card]` to its launch variant when a seat is proven. Returns the counts it read. */
export async function showLaunchOffers(root: ParentNode = document): Promise<CohortCount[] | null> {
  const counts = await readCounts();
  for (const card of root.querySelectorAll<HTMLElement>('[data-card]')) {
    // A launch plan's key is its cohort's name (pricing-config.ts).
    const left = card.dataset.card ? seatsLeft(counts, card.dataset.card) : null;
    if (!left) continue;
    const regular = card.querySelector<HTMLElement>('[data-variant="regular"]');
    const launch = card.querySelector<HTMLElement>('[data-variant="launch"]');
    if (regular && launch) {
      regular.hidden = true;
      launch.hidden = false;
    }
  }
  return counts;
}
