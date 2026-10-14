import type { Listing } from '@/types/listing';

import type { PageLang } from './i18n';

/**
 * The listing as its page in another language shows it: the agent's own
 * translated title and description (migration 0044) in place of the Hebrew,
 * or undefined when they never saved that language. Everything else — the
 * facts, the price, the photographs — is the same listing; the words around
 * them come from our copy in that language.
 */
export function translatedListing(listing: Listing, language: PageLang): Listing | undefined {
  const translation = listing.translations?.[language];
  if (!translation?.title) return undefined;
  return {
    ...listing,
    title: translation.title,
    description: translation.description,
    ...(listing.priceNote && translation.priceNote ? { priceNote: translation.priceNote } : {}),
    ...(listing.disclosures && translation.disclosures?.length === listing.disclosures.length
      ? { disclosures: translation.disclosures }
      : {}),
  };
}

/** The languages a listing can be read in, Hebrew first. */
export function pageLanguages(listing: Pick<Listing, 'translations'>): ('he' | PageLang)[] {
  return ['he', ...(['en', 'ru', 'ar'] as const).filter((language) => Boolean(listing.translations?.[language]?.title))];
}

/** The page's own address in a language. */
export function languagePath(slug: string, language: 'he' | PageLang): string {
  return language === 'he' ? `/a/${slug}/` : `/a/${slug}/${language}/`;
}
