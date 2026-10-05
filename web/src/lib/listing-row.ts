import type { EditorState } from '@/features/listings/editor';
import { isAccentId } from '@/features/agents/accents';
import { toSeller, type AgentProfile } from '@/features/agents/profile';
import { schemaFor } from '@/features/listings/schemas';
import type { PhotoRoom } from '@/features/listings/photo-rooms';
import type { PlanRoom } from '@/features/listings/rich-media';
import type { EditorPhoto } from '../components/editor/PhotosStep';

/**
 * The listing row the editor writes, built without a database.
 *
 * Moved out of listing-save.ts (P6) so the live preview can build the SAME
 * row a save writes and hand it to the same `listingFromRow` the published
 * page reads. One mapping, two callers: the preview cannot show a page the
 * publish would not produce.
 */

/** What the page needs to render one photograph. */
export interface SavedPhoto {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
  room?: PhotoRoom;
}

/**
 * The media column's shape, matching `Media` in @/types/listing.
 *
 * The FIRST photo is the cover, because that is the frame the WhatsApp card
 * is cut from and the order the seller arranged is the order they meant
 * (CLAUDE.md §4.4 — in RTL the first item is the rightmost).
 */
/**
 * The P7 extras the editor holds beside the photographs: the floor plan with
 * the rooms drawn on it, and a car's 360° frames. Validated again on the way
 * out of the row (rich-media.ts), so what is written here is a request.
 */
export interface MediaExtras {
  plan?: { url: string; width: number; height: number; rooms: readonly PlanRoom[] } | undefined;
  spin?: readonly { id: string; url: string; width: number; height: number }[] | undefined;
}

export function toMedia(photos: readonly SavedPhoto[], tourUrl?: string, extras: MediaExtras = {}) {
  const [cover, ...rest] = photos;

  /*
   * NO COVER MEANS "DO NOT WRITE", not "write nothing".
   *
   * This returned `{}` and the callers wrote it, which is how an agent lost a
   * whole listing's photographs: the files were in Storage — 41 of them, on
   * the row that prompted this — and `listings.media` was `{}`, so the
   * dashboard showed no pictures and the published page could not be built at
   * all. Any save that ran before an upload finished overwrote the URLs of
   * the uploads that HAD finished.
   *
   * Returning undefined lets `saveListing` leave the column alone, and the
   * only place `{}` is now written is a seller who removed every photo.
   */
  if (!cover) return undefined;

  const tour = tourUrl?.trim();

  return {
    cover: {
      id: cover.id,
      url: cover.url,
      alt: cover.alt,
      width: cover.width,
      height: cover.height,
      ...(cover.room ? { room: cover.room } : {}),
    },
    gallery: rest.map((photo) => ({
      id: photo.id,
      url: photo.url,
      alt: photo.alt,
      width: photo.width,
      height: photo.height,
      ...(photo.room ? { room: photo.room } : {}),
    })),
    ...(tour && tour.startsWith('https://') ? { tourUrl: tour } : {}),
    ...(extras.plan
      ? {
          floorPlan: {
            id: 'plan',
            url: extras.plan.url,
            alt: '',
            width: extras.plan.width,
            height: extras.plan.height,
            rooms: extras.plan.rooms,
          },
        }
      : {}),
    ...(extras.spin && extras.spin.length > 0
      ? { spin: extras.spin.map((frame) => ({ id: frame.id, url: frame.url, alt: '', width: frame.width, height: frame.height })) }
      : {}),
  };
}

/**
 * Columns the editor writes on every save, including the ones that used
 * to die with the tab: pre-portal, and the dated owner-consent record.
 */
export function editorColumns(state: EditorState) {
  return {
    title: state.title,
    price: state.price,
    description: state.description,
    facts: state.facts,
    location:
      state.city || state.street
        ? { city: state.city ?? '', ...(state.street ? { street: state.street } : {}) }
        : null,
    price_note: state.priceNote?.trim() ? state.priceNote.trim() : null,
    ...(state.template ? { template: state.template } : {}),
    ...(state.accent && isAccentId(state.accent) ? { accent: state.accent } : {}),
    ...(state.audience ? { audience: state.audience } : {}),
    ...(state.disclosures ? { disclosures: state.disclosures } : {}),
    indexable: state.indexable === true,
    pre_portal: state.prePortal === true,
    owner_consent_declared_at: state.ownerConsentDeclaredAt ?? null,
    owner_consent_name: state.ownerConsentName?.trim() ? state.ownerConsentName.trim() : null,
  };
}

/** The photos that have a public URL, in the seller's order. */
export function savedPhotos(
  photos: readonly EditorPhoto[],
  options: { local?: boolean } = {},
): SavedPhoto[] {
  return photos
    // The preview (local) may show a photograph still uploading, from its
    // own object URL; a save may only write the public copy.
    .map((photo) => ({ photo, url: photo.publicUrl ?? (options.local ? photo.url : undefined) }))
    .filter((entry): entry is { photo: EditorPhoto; url: string } => Boolean(entry.url))
    .map(({ photo, url }, index) => ({
      id: photo.id,
      url,
      // Empty is the correct value for "nobody wrote one" — inventing a
      // description from the file name would be worse than silence.
      alt: photo.alt?.trim() ?? '',
      // Recorded at upload, so the page can reserve the box before the bytes
      // arrive. Zero would produce a CLS penalty on every listing.
      width: photo.width ?? 0,
      height: photo.height ?? 0,
      ...(photo.room ? { room: photo.room } : {}),
      index,
    }));
}


/**
 * The body the live preview posts (pages/preview.astro).
 *
 * The same columns and media a save writes, plus the seller a save would
 * stamp. Photographs still uploading are shown from their object URL — the
 * preview's only difference from a save, and one the server re-checks.
 *
 * With no complete profile yet the seller is a placeholder so the page can
 * still be drawn; nothing about a preview is stored, and its links are inert.
 *
 * CLAUDE.md §8 — FLAGGED FOR REVIEW, display only: `hyad_mark` follows the
 * editor's entitlement read so the preview shows the נבנה בהיעד mark the
 * publish would. It decides nothing: the publish trigger stamps the real
 * mark, and an unknown or failed read shows the mark (fail closed).
 */
export function previewPayload(
  state: EditorState,
  photos: readonly EditorPhoto[],
  profile: AgentProfile,
  placeholderName: string,
  extras: MediaExtras = {},
  sun?: { lat: number; lng: number },
  /** The row's surroundings, so the preview map and the sun share one origin. */
  areaPlaces?: unknown,
): Record<string, unknown> {
  const category = state.category ?? 'property';
  const ownerRole = schemaFor(category).ownerRole;
  const seller = toSeller(profile, ownerRole) ?? {
    name: profile.displayName?.trim() || placeholderName,
    phone: '0500000000',
    role: ownerRole,
  };
  const accent = isAccentId(state.accent) ? state.accent : isAccentId(profile.accent) ? profile.accent : undefined;
  return {
    category,
    ...editorColumns(state),
    template: state.template ?? 'agency',
    media: toMedia(savedPhotos(photos, { local: true }), state.tourUrl, extras) ?? null,
    seller,
    ...(accent ? { accent } : {}),
    ...(sun ? { sun } : {}),
    ...(areaPlaces ? { area_places: areaPlaces } : {}),
    hyad_mark: state.entitlement !== 'paid',
  };
}
