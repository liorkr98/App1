/**
 * The only URL Puppeteer is allowed to open.
 *
 * The job payload is client-shaped: enqueue_job takes a jsonb `payload`, and
 * `baseUrl` was documented as an override for rendering a preview before
 * publish. That override is the attack. This process holds the service-role
 * key, Chrome runs with `--no-sandbox`, and a payload of
 * `{ slug: "A7K2M", baseUrl: "https://evil.example" }` would have the
 * renderer visit an origin we do not serve — with that key in its environment.
 *
 * So `baseUrl` may only repeat PAGE_BASE_URL's origin. The path is always
 * `/a/{slug}/`, never taken from the payload. The slug is the same five
 * Crockford characters the listings CHECK constraint allows — a value that
 * can encode `../` or a query string is refused before Chrome starts.
 */

/** Same alphabet as src/features/listings/slug.ts and migration 0002. */
export const SLUG_PATTERN = /^[0-9A-HJKMNP-TV-Z]{5}$/;

/**
 * Which page of a listing the browser may open. A fixed map, so the payload
 * picks one of these three paths and can never supply a path of its own.
 */
export const LISTING_PAGES = {
  listing: '',
  flyer: 'flyer/',
  story: 'story/',
} as const;

export type ListingPage = keyof typeof LISTING_PAGES;

export function isListingPage(value: unknown): value is ListingPage {
  return typeof value === 'string' && Object.hasOwn(LISTING_PAGES, value);
}

export function listingPdfUrl(input: {
  slug: unknown;
  pageBaseUrl: string;
  baseUrl?: unknown;
  page?: ListingPage;
}): string | undefined {
  if (typeof input.slug !== 'string' || !SLUG_PATTERN.test(input.slug)) {
    return undefined;
  }

  let allowed: URL;
  try {
    allowed = new URL(input.pageBaseUrl);
  } catch {
    return undefined;
  }

  if (input.baseUrl !== undefined && input.baseUrl !== null && input.baseUrl !== '') {
    if (typeof input.baseUrl !== 'string') return undefined;
    let candidate: URL;
    try {
      candidate = new URL(input.baseUrl);
    } catch {
      return undefined;
    }
    if (candidate.origin !== allowed.origin) return undefined;
  }

  return `${allowed.origin}/a/${input.slug}/${LISTING_PAGES[input.page ?? 'listing']}`;
}
