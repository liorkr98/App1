import type { Listing } from '@/types/listing';
import { shareMessage } from '@/features/listings/share-message';

import { toCells } from './facts';
import { ils } from './format';
import { t } from './i18n';

/**
 * What an agent sends, built from the listing once, for every place that
 * sends it: the share kit (/a/{slug}/share/) and the share sheet's
 * /a/{slug}/message.json. Two copies of this would drift, and the agent would
 * get a different message from the dashboard than from the kit.
 */
export interface ShareText {
  /** Absolute page link. */
  url: string;
  /** The whole message, the link as its last line (share-message.ts). */
  message: string;
  /** The title on one line. */
  title: string;
  /** Formatted with ₪, or empty when the price is unanswered. */
  price: string;
  /** Street and city, or the city. */
  place: string;
  /** Up to four short facts, schema order. */
  teaser: string[];
  /** The cover photograph, for the preview. */
  cover: string;
}

export function shareText(listing: Listing, site: string): ShareText {
  const url = `${site}/a/${listing.slug}/`;

  /*
   * Facts for the teaser, in schema order.
   *
   * Absences are dropped. "אין מחסן" is honest information on the page, where
   * a buyer is weighing the whole property, and it is a strange thing to lead
   * with in a message whose only job is to earn a tap.
   */
  const title = listing.title.replace(/\s*\n\s*/g, ' ');

  // Same ordering as the page, so the teaser leads with whatever the grid does.
  const cells = toCells(listing.category, listing.facts, listing.audience);
  const teaser = cells
    .filter((cell) => !cell.absent && cell.value !== 'אין')
    /*
     * Drop anything the title already said.
     *
     * "דירת 4 חדרים" followed by a facts line beginning "4 חדרים" is the
     * message repeating itself in the two lines that get read. The title is
     * written by the seller and leads with whatever they thought mattered
     * most, so it is the title that wins and the fact that goes.
     */
    .filter((cell) => !(title.includes(cell.value) && title.includes(cell.label)))
    .slice(0, 4)
    .map((cell) => {
      if (cell.value === 'יש') return cell.label;
      if (cell.displayValue !== cell.value) return `${cell.label} ${cell.displayValue}`;
      return `${cell.value} ${cell.label}`;
    });

  const place = listing.location?.street
    ? `${listing.location.street}, ${listing.location.city}`
    : (listing.location?.city ?? '');

  const price = listing.price > 0 ? ils(listing.price) : '';
  const message = shareMessage({
    title: listing.title,
    price,
    ...(listing.shareLine ? { line: listing.shareLine } : {}),
    facts: teaser,
    ...(place ? { place } : {}),
    ...(listing.prePortal ? { prePortalLine: t('listing.prePortal') } : {}),
    url,
  });

  return { url, message, title, price, place, teaser, cover: listing.media.cover.url };
}
