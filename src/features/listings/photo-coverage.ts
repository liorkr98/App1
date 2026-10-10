import type { Fact } from '../../types/listing.js';
import type { PhotoRoom } from './photo-rooms.js';

/**
 * Does the photo set show the flat the facts describe? (10 Oct 2026)
 *
 * An Israeli room count includes the living room: "4 rooms" is a living room
 * and three bedrooms, with a kitchen and a bathroom besides. A buyer who reads
 * 4 rooms and sees two bedrooms assumes the third is the one with the
 * problem. So the editor works out, from the facts, which photographs the
 * page owes its reader, and says which ones are not there yet.
 *
 * ADVICE, NEVER A BLOCK — the same rule as photo-guidance.ts. Some flats
 * really have no photograph of a room, and the page is the agent's.
 *
 * MISSING VERSUS UNSURE. Most agents never label a photo, and a checklist
 * that announced "no kitchen" over an unlabelled kitchen would be wrong in
 * the way that teaches people to ignore it. A room short of photos while
 * unlabelled photos exist is `unsure`, not `missing`: it may be in there.
 */

export interface CoveragePhoto {
  room?: PhotoRoom;
  status?: 'local' | 'uploading' | 'uploaded' | 'failed';
}

export type NeedState = 'ok' | 'missing' | 'unsure';

export interface RoomNeed {
  room: PhotoRoom;
  need: number;
  have: number;
  /** Suggested, not owed: a building photo helps, its absence is not a gap. */
  optional: boolean;
  state: NeedState;
}

export interface Coverage {
  needs: RoomNeed[];
  /** Photos nobody has given a room yet. */
  unlabeled: number;
  /** Photos whose upload failed and need a retry. */
  failed: number;
  /** Photos still on their way. */
  pending: number;
  /** How many photographs this listing should have, all told. */
  recommended: number;
  /** Uploaded, and every owed room covered. */
  ready: boolean;
}

/** The fallback when the room count is unknown, and for a car. */
export const DEFAULT_RECOMMENDED = 8;

function numberFact(facts: readonly Fact[], key: string): number | undefined {
  const fact = facts.find((item) => item.key === key);
  if (!fact || !fact.present) return undefined;
  return typeof fact.value === 'number' && Number.isFinite(fact.value) ? fact.value : undefined;
}

/**
 * Bedrooms in an Israeli room count: whole rooms less the living room.
 * 3.5 is a living room, two bedrooms and a small room that may be a study,
 * so it owes two. 1 and 1.5 are studios.
 */
export function bedroomsFor(rooms: number): number {
  return Math.max(0, Math.floor(rooms) - 1);
}

interface Wanted {
  room: PhotoRoom;
  need: number;
  optional?: boolean;
  /** Counts toward the recommended total; more than `need` for the living room. */
  ideal?: number;
}

function wantedFor(facts: readonly Fact[]): Wanted[] {
  const rooms = numberFact(facts, 'rooms');
  const balcony = numberFact(facts, 'balcony_sqm');
  const wanted: Wanted[] = [
    { room: 'living', need: 1, ideal: 2 },
    { room: 'kitchen', need: 1 },
  ];
  if (rooms !== undefined) {
    const bedrooms = bedroomsFor(rooms);
    if (bedrooms > 0) wanted.push({ room: 'bedroom', need: bedrooms });
  }
  wanted.push({ room: 'bathroom', need: 1 });
  if (balcony !== undefined && balcony > 0) wanted.push({ room: 'balcony', need: 1 });
  wanted.push({ room: 'outdoor', need: 1, optional: true });
  return wanted;
}

export function photoCoverage(
  category: 'property' | 'vehicle' | undefined,
  facts: readonly Fact[],
  photos: readonly CoveragePhoto[],
): Coverage {
  const failed = photos.filter((photo) => photo.status === 'failed').length;
  const pending = photos.filter((photo) => photo.status === 'local' || photo.status === 'uploading').length;
  const uploadsDone = failed === 0 && pending === 0;

  if (category !== 'property') {
    return {
      needs: [],
      unlabeled: 0,
      failed,
      pending,
      recommended: DEFAULT_RECOMMENDED,
      ready: uploadsDone && photos.length > 0,
    };
  }

  const unlabeled = photos.filter((photo) => photo.room === undefined).length;
  const count = (room: PhotoRoom) => photos.filter((photo) => photo.room === room).length;

  const wanted = wantedFor(facts);
  const needs: RoomNeed[] = wanted.map(({ room, need, optional }) => {
    const have = count(room);
    const state: NeedState = have >= need ? 'ok' : unlabeled > 0 ? 'unsure' : 'missing';
    return { room, need, have, optional: optional === true, state };
  });

  const recommended = Math.max(
    wanted.reduce((sum, item) => sum + (item.ideal ?? item.need), 0),
    // An unknown room count still deserves a full page.
    numberFact(facts, 'rooms') === undefined ? DEFAULT_RECOMMENDED : 0,
  );

  const owedCovered = needs.every((need) => need.optional || need.state === 'ok');
  return {
    needs,
    unlabeled,
    failed,
    pending,
    recommended,
    ready: uploadsDone && photos.length > 0 && owedCovered,
  };
}
