import { offeredPlan, type CohortCount } from '@/features/billing/price';

import { formatValue, parts } from './i18n';

/**
 * The pricing page's own words around the launch offer: the headline price
 * and the real seat count (docs/PRICING.md §6). Kept apart from
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
  for (const headline of root.querySelectorAll<HTMLElement>('[data-offer]')) {
    const key = headline.dataset.offer as 'agent_launch' | 'dealer_launch';
    if (offeredPlan(key, counts).plan.key === key && headline.dataset.launch && headline.dataset.path) {
      headline.replaceChildren(messageNodes(headline.dataset.path, { price: headline.dataset.launch }));
    }
  }

  for (const line of root.querySelectorAll<HTMLElement>('[data-seats]')) {
    const key = line.dataset.seats as 'agent_launch' | 'dealer_launch';
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
