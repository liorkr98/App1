import { seatsLeft, type CohortCount } from '@/features/billing/seats';

import { key, url } from './supabase-project';

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
  if (!url || !key) return null;
  try {
    // One public read, so a plain PostgREST request rather than the Supabase
    // client, which is 210 KB on the homepage and the pricing page
    // (16 Oct 2026). The publishable key goes in `apikey`, as the client
    // would send it for a signed-out visitor; RLS decides what it may read.
    const response = await fetch(`${url}/rest/v1/cohort_counters?select=cohort,used,cap`, {
      headers: { apikey: key, accept: 'application/json' },
    });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return Array.isArray(data) ? (data as CohortCount[]) : null;
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
      // Visibility, not display: both stay in their shared cell (no layout shift).
      regular.classList.add('is-off');
      launch.classList.remove('is-off');
    }
  }
  return counts;
}
