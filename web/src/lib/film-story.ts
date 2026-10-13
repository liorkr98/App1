import type { Listing } from '@/types/listing';
import { publicPlace } from '@/features/listings/control-surface';
import { FILM_MAX } from '@/features/listings/ken-burns';
import { shareContent } from './share-draw';
import { t } from './i18n';

/**
 * The words the story file carries, from the same place the WhatsApp card
 * takes them (share-draw.ts shareContent), so the video, the card and the
 * page cannot disagree about a fact or the price.
 *
 * The place goes through publicPlace — the street, never the building — and
 * the closing card names the seller and their agency only: no phone number
 * travels with a forwarded video (the owner's choice, 13 Oct 2026). The
 * plate is not a fact (toCells drops it), so it cannot appear.
 */
export interface FilmStory {
  place?: string;
  titleLines: string[];
  facts: { label: string; value: string; isolated: boolean }[];
  price?: string;
  /** Each photograph's room name, in film order; undefined when unlabelled. */
  rooms: (string | undefined)[];
  seller?: { name: string; role?: string; logoUrl?: string };
}

/** The photographs the film uses: the cover, then the gallery in published order. */
export function filmPhotos(listing: Listing) {
  return [listing.media.cover, ...listing.media.gallery].slice(0, FILM_MAX);
}

export function filmStory(listing: Listing): FilmStory {
  const content = shareContent(listing);
  const place = listing.location ? publicPlace(listing.location) : '';
  const name = listing.seller.name.trim();
  return {
    ...(place ? { place } : {}),
    titleLines: content.titleLines.map((line) => line.trim()).filter(Boolean),
    facts: content.cells,
    ...(content.price ? { price: content.price } : {}),
    rooms: filmPhotos(listing).map((photo) => (photo.room ? t(`editor.rooms.${photo.room}`) : undefined)),
    ...(name
      ? {
          seller: {
            name,
            ...(listing.seller.agencyName ? { role: listing.seller.agencyName } : {}),
            ...(listing.seller.agencyLogoUrl ? { logoUrl: listing.seller.agencyLogoUrl } : {}),
          },
        }
      : {}),
  };
}
