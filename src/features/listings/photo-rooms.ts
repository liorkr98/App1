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

/**
 * A hint from the filename, never a caption we invent for the buyer.
 *
 * Israeli agents often keep camera-roll names, which yield nothing. When the
 * file is already called מטבח or kitchen.jpg, asking "is this the kitchen?"
 * with that chip already pressed is the recognition the seller asked for —
 * they still confirm it in the rooms step.
 */
const NAME_HINTS: readonly { room: PhotoRoom; pattern: RegExp }[] = [
  { room: 'kitchen', pattern: /מטבח|kitchen|cook/i },
  { room: 'bathroom', pattern: /אמבט|שירותים|מקלחת|bath|toilet|wc/i },
  { room: 'bedroom', pattern: /שינה|bedroom|\bbed\b/i },
  { room: 'living', pattern: /סלון|living|lounge|salon/i },
  { room: 'balcony', pattern: /מרפסת|balcony|terrace/i },
  { room: 'outdoor', pattern: /גינה|חוץ|garden|yard|outdoor|facade|חזית/i },
];

export function guessRoomFromName(fileName: string): PhotoRoom | undefined {
  const name = fileName.trim();
  if (!name) return undefined;
  for (const hint of NAME_HINTS) {
    if (hint.pattern.test(name)) return hint.room;
  }
  return undefined;
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

/**
 * Photographs that belong in the walk: labelled rooms, in tour order.
 *
 * Unlabeled pictures stay out — they belong in the gallery below, if one
 * remains after the walk has taken its own frames. The listing used to
 * render the same kitchen twice, once in the walk and once in the grid.
 */
export function labeledWalkItems<T extends { room?: PhotoRoom }>(photos: readonly T[]): T[] {
  if (!hasRoomLabels(photos)) return [];
  return groupByRoom(photos)
    .filter((group): group is { room: PhotoRoom; items: T[] } => group.room !== undefined)
    .flatMap((group) => group.items);
}

/** True when this photograph already appears in the walk. */
export function isWalkItem<T extends { id?: string; url?: string }>(
  photo: T,
  walk: readonly T[],
): boolean {
  return walk.some(
    (item) =>
      (photo.id !== undefined && item.id !== undefined && photo.id === item.id) ||
      (photo.url !== undefined && item.url !== undefined && photo.url === item.url),
  );
}
