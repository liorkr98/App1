import { offeredPlan, type CohortCount } from '@/features/billing/price';

import { formatValue, parts } from './i18n';

/**
 * The pricing page's own words around the launch offer: the real seat count
 * (docs/PRICING.md §6). The headline quotes the lowest plan, which the launch
 * price does not undercut, so it no longer swaps. Kept apart from
 * launch-offer.ts so the homepage does not load the locale file.
 */

/** A message with each value in <bdi>, built as nodes (CLAUDE.md §4.2). */
export function messageNodes(path: string, values: Record<string, string | number>): DocumentFragment {
  const out = document.createDocumentFragment();
  for (const part of parts(path)) {
    if ('text' in part) out.append(part.text);
    else {
      const bdi = document.createElement('bdi');
      bdi.textContent = formatValue(values[part.slot] ?? '');
      out.append(bdi);
    }
  }
  return out;
}

export function showLaunchText(counts: CohortCount[] | null, root: ParentNode = document): void {
  for (const line of root.querySelectorAll<HTMLElement>('[data-seats]')) {
    const key = line.dataset.seats as 'agent_launch';
    const count = counts?.find((row) => row.cohort === key);
    if (!count) continue;
    const { seatsLeft } = offeredPlan(key, counts);
    line.replaceChildren(
      seatsLeft && seatsLeft > 0
        ? messageNodes('pricing.seatsLeft', { remaining: seatsLeft, cap: count.cap })
        : messageNodes('pricing.seatsGone', { cap: count.cap }),
    );
    line.classList.remove('is-off');
  }
}
