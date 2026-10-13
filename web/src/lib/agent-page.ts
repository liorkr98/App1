import type { Listing } from '@/types/listing';
import { telHref } from '@/features/listings/phone';

import { listingFromRow, LISTING_COLUMNS, type ListingRow } from './listing-row-map';
import { supabaseConfigured, supabasePublic } from './supabase';

/**
 * An agent's public page (migration 0041), as the page renders it.
 *
 * public_agent() decides who has a page and which listings it shows; this
 * file only reads. The listings come back through listingFromRow, the same
 * path the listing page takes, so the street (never the building) and the
 * price display behave exactly as they do there.
 */
export interface AgentPage {
  code: string;
  handle?: string;
  name: string;
  phone?: string;
  role?: string;
  agency?: string;
  logo?: string;
  accent?: string;
  kind: 'agent' | 'office' | 'dealer';
  licenceVerified: boolean;
  listings: Listing[];
}

interface AgentRow {
  code: string;
  handle: string | null;
  name: string | null;
  phone: string | null;
  role: string | null;
  agency: string | null;
  logo: string | null;
  accent: string | null;
  kind: string;
  licence_verified: boolean;
  listings: string[];
}

const text = (value: string | null | undefined) => (value && value.trim() ? value.trim() : undefined);

/** Undefined when there is no such page, it is off, or the database cannot say. */
export async function loadAgentPage(key: string): Promise<AgentPage | undefined> {
  if (!supabaseConfigured || !/^[A-Za-z0-9-]{3,30}$/.test(key)) return undefined;
  try {
    const { data, error } = await supabasePublic().rpc('public_agent', { p_key: key });
    if (error || !data) return undefined;
    const row = data as AgentRow;
    const name = text(row.name);
    if (!name || !['agent', 'office', 'dealer'].includes(row.kind)) return undefined;
    return {
      code: row.code,
      ...(text(row.handle) ? { handle: text(row.handle)! } : {}),
      name,
      ...(text(row.phone) ? { phone: text(row.phone)! } : {}),
      ...(text(row.role) ? { role: text(row.role)! } : {}),
      ...(text(row.agency) ? { agency: text(row.agency)! } : {}),
      ...(text(row.logo) ? { logo: text(row.logo)! } : {}),
      ...(text(row.accent) ? { accent: text(row.accent)! } : {}),
      kind: row.kind as AgentPage['kind'],
      licenceVerified: row.licence_verified === true,
      listings: await listingsBySlug(row.listings ?? []),
    };
  } catch {
    return undefined;
  }
}

/** The listings, in the order public_agent gave them; any that will not render drop out. */
async function listingsBySlug(slugs: readonly string[]): Promise<Listing[]> {
  if (slugs.length === 0) return [];
  const { data, error } = await supabasePublic().from('listings').select(LISTING_COLUMNS).in('slug', [...slugs]);
  if (error || !data) return [];
  const bySlug = new Map<string, Listing>();
  for (const row of data as unknown as ListingRow[]) {
    const listing = listingFromRow(row);
    if (listing) bySlug.set(listing.slug, listing);
  }
  return slugs.flatMap((slug) => (bySlug.has(slug) ? [bySlug.get(slug)!] : []));
}

/** The page's own address: the handle when there is one. */
export function agentPath(page: Pick<AgentPage, 'code' | 'handle'>): string {
  return `/agent/${page.handle ?? page.code}/`;
}

/** wa.me wants the number in international form without the plus. */
export function agentWhatsApp(phone: string | undefined): string | undefined {
  const tel = phone ? telHref(phone) : '';
  return tel ? `https://wa.me/${tel.replace('tel:+', '')}` : undefined;
}

/** Every page that is on, for the sitemap. */
export async function agentPageKeys(): Promise<string[]> {
  if (!supabaseConfigured) return [];
  try {
    const { data, error } = await supabasePublic().rpc('public_agent_keys');
    if (error || !data) return [];
    return (data as { key: string }[]).map((row) => row.key).filter(Boolean);
  } catch {
    return [];
  }
}
