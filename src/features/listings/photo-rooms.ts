/**
 * Rooms a property photograph can belong to.
 *
 * The seller names the room. A later classifier can fill the same field —
 * the page only ever reads this union, so the two producers cannot drift.
 *
 * A vehicle has no rooms. Callers that have a category must not offer these
 * options for one, and the listing page omits the walk when nothing is
 * labelled (the same data-driven omit as an empty disclosures list).
 */

export const PHOTO_ROOMS = [
  'living',
  'kitchen',
  'bedroom',
  'bathroom',
  'balcony',
  'outdoor',
  'other',
] as const;

export type PhotoRoom = (typeof PHOTO_ROOMS)[number];

export function isPhotoRoom(value: unknown): value is PhotoRoom {
  return typeof value === 'string' && (PHOTO_ROOMS as readonly string[]).includes(value);
}

export interface RoomGroup<T> {
  room?: PhotoRoom;
  items: T[];
}

/**
 * Groups photographs for headlines and for the walk.
 *
 * Labeled rooms come out in PHOTO_ROOMS order — living, then kitchen, then
 * the private rooms — so the walk is a tour rather than the upload order.
 * Unlabeled photographs trail, with no headline: inventing "אחר" for a photo
 * nobody named would be a caption the seller did not write.
 */
export function groupByRoom<T extends { room?: PhotoRoom }>(photos: readonly T[]): RoomGroup<T>[] {
  const buckets = new Map<PhotoRoom | '', T[]>();
  for (const room of PHOTO_ROOMS) buckets.set(room, []);
  buckets.set('', []);

  for (const photo of photos) {
    const key = photo.room ?? '';
    buckets.get(key)?.push(photo);
  }

  const groups: RoomGroup<T>[] = [];
  for (const room of PHOTO_ROOMS) {
    const items = buckets.get(room) ?? [];
    if (items.length > 0) groups.push({ room, items });
  }
  const unlabeled = buckets.get('') ?? [];
  if (unlabeled.length > 0) groups.push({ items: unlabeled });
  return groups;
}

export function hasRoomLabels<T extends { room?: PhotoRoom }>(photos: readonly T[]): boolean {
  return photos.some((photo) => photo.room !== undefined);
}
