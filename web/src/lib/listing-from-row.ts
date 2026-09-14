import { createClient } from '@supabase/supabase-js';

import type { Fact, Listing } from '@/types/listing';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase';

/**
 * Reading a published listing at request time.
 *
 * WHY THIS EXISTS. `/a/[slug]` used `getStaticPaths()` over the two demo
 * listings in listings.ts, so a page existed for A7K2M and V3M9Q and for
 * nothing else. An agent could complete the whole flow and the link they
 * shared would 404 — the one artefact the entire product is built to produce.
 *
 * A SEPARATE CLIENT FROM lib/supabase.ts, deliberately. That one is the
 * BROWSER's: it persists a session, refreshes tokens and reads the URL for an
 * auth callback. None of that belongs in a Worker handling a request for
 * somebody else's page, and `detectSessionInUrl` on a server would try to read
 * a session out of a visitor's URL.
 *
 * ANON KEY ONLY, AND THAT IS THE POINT. The select below has no owner filter
 * because the public-read policy in 0002 is what decides what comes back:
 *
 *   using (status in ('published', 'sold'))
 *
 * A draft is therefore invisible here even with a correct slug, and it is
 * invisible because the database says so rather than because this file
 * remembered to ask. The service-role key would bypass that and must never
 * reach this bundle (CLAUDE.md §9).
 */
function readClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** The columns the page renders. */
const COLUMNS =
  'id, slug, category, title, description, price, currency, list_price, price_note, facts, media, disclosures, location, seller, template, accent, status, indexable, published_at';

type Row = Record<string, unknown>;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const maybeText = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;
const number = (value: unknown): number => {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Maps a database row onto the shape the components render.
 *
 * Every field is coerced rather than cast. `price` is numeric(12,2), which
 * PostgREST returns as a STRING — rendering that straight into the price bar
 * would print "1850000.00" where the page promises ₪1,850,000, and a cast
 * would have hidden it behind a type that was never true.
 */
export function listingFromRow(row: Row): Listing {
  const media = (row.media ?? {}) as Listing['media'];
  const location = (row.location ?? undefined) as Listing['location'];
  const seller = (row.seller ?? {}) as Listing['seller'];

  return {
    id: text(row.id),
    slug: text(row.slug),
    category: row.category === 'vehicle' ? 'vehicle' : 'property',

    title: text(row.title),
    description: text(row.description),
    price: number(row.price),
    currency: text(row.currency) || 'ILS',
    ...(row.list_price === null || row.list_price === undefined
      ? {}
      : { listPrice: number(row.list_price) }),
    ...(maybeText(row.price_note) ? { priceNote: text(row.price_note) } : {}),

    facts: Array.isArray(row.facts) ? (row.facts as Fact[]) : [],
    media,
    ...(Array.isArray(row.disclosures) && row.disclosures.length > 0
      ? { disclosures: row.disclosures as string[] }
      : {}),
    ...(location ? { location } : {}),
    seller,

    template: (row.template === 'agency' || row.template === 'dark'
      ? row.template
      : 'editorial') as Listing['template'],
    ...(maybeText(row.accent) ? { accent: text(row.accent) } : {}),

    status: (row.status === 'sold' ? 'sold' : 'published') as Listing['status'],
    // Default FALSE. A private seller rarely wants their home address
    // permanently searchable, and the column decides — not this mapper
    // (CLAUDE.md §7).
    indexable: row.indexable === true,
    ...(maybeText(row.published_at) ? { publishedAt: text(row.published_at) } : {}),
  };
}

/**
 * The published listing for a slug, or undefined.
 *
 * Undefined covers "no such slug" and "there is a row but it is a draft"
 * identically, and that is deliberate: telling a stranger which unpublished
 * slugs exist is an information leak dressed as a helpful error.
 */
export async function publishedListing(slug: string): Promise<Listing | undefined> {
  try {
    const { data, error } = await readClient()
      .from('listings')
      .select(COLUMNS)
      .eq('slug', slug)
      .maybeSingle();

    if (error || !data) return undefined;

    return listingFromRow(data as Row);
  } catch {
    // A page that 500s because Supabase was slow is worse than a 404 the
    // agent can retry. Either way the buyer sees something rather than a
    // stack trace.
    return undefined;
  }
}
