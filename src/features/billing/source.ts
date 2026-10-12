/**
 * Where a person first came from (docs/PRICING.md §7: every billing event
 * carries `source`). The credit on a listing page links with ?src=credit,
 * which is how page_credit — the viral loop — is told apart from organic.
 */
export type Source = 'email' | 'referral' | 'page_credit' | 'organic' | 'paid';

const SEARCH_ENGINE = /(^|\.)(google|bing|duckduckgo|yahoo|yandex|ecosia|brave|baidu)\./;

export function classifySource(href: string, referrer: string): Source {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return 'organic';
  }
  const q = url.searchParams;
  const medium = (q.get('utm_medium') ?? '').toLowerCase();
  const source = (q.get('utm_source') ?? '').toLowerCase();
  if (q.get('src') === 'credit') return 'page_credit';
  if (medium === 'email' || source === 'email' || source === 'newsletter') return 'email';
  if (q.has('gclid') || q.has('fbclid') || ['cpc', 'ppc', 'paid', 'ads', 'paid_social'].includes(medium)) return 'paid';
  if (q.has('ref') || medium === 'referral') return 'referral';
  if (referrer) {
    try {
      const from = new URL(referrer);
      if (from.hostname !== url.hostname && !SEARCH_ENGINE.test(from.hostname)) return 'referral';
    } catch {
      // An unreadable referrer says nothing.
    }
  }
  return 'organic';
}
