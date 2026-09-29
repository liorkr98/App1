/**
 * The price list, in one place. The homepage strip (PriceTiers) and the
 * pricing page both read it, so they cannot quote two different prices.
 *
 * DISPLAY ONLY. Nothing here decides what anyone may publish: entitlement is
 * listing_grants and the publish trigger (CLAUDE.md §8), and checkout stays
 * a disabled control until an Israeli PSP is signed.
 */
export const PRICE_TIERS = [
  { id: 'free', price: 0, featured: false },
  { id: 'single', price: 79, featured: false },
  { id: 'pack', price: 129, featured: false },
  { id: 'agent', price: 249, featured: true },
] as const;

export type PriceTierId = (typeof PRICE_TIERS)[number]['id'];

/** Paid add-ons. No price until a vendor and a price are decided. */
export const ADDONS = ['video', 'tour', 'staging', 'qa'] as const;
