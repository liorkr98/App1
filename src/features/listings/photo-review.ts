/**
 * What DeepSeek may write about a photograph, and nothing else.
 *
 * Hebrew is not in here. The model returns one of these keys; the editor
 * reads the sentence from locales/. An answer that is not one of these keys
 * is dropped, never guessed into a label.
 *
 * The picture goes to `deepseek-flash` on the Worker, with the same
 * DEEPSEEK_API_KEY as the description. The system text has to say "json"
 * and show an example, which is what that API requires for JSON output.
 */

import { isPhotoRoom, type PhotoRoom } from './photo-rooms.js';

/**
 * Where the camera stands round a car (18 Oct 2026). The first eight are the
 * walk round it, in order: the 360 on the page is built from these, one
 * photograph per angle, so the seller does not shoot a second set. "left" is
 * the car's own left. The rest are close-ups that never join the turn.
 */
export const PHOTO_ANGLES = [
  'front',
  'frontLeft',
  'left',
  'rearLeft',
  'rear',
  'rearRight',
  'right',
  'frontRight',
  'interior',
  'dashboard',
  'engine',
  'trunk',
  'wheel',
  'detail',
] as const;

export type PhotoAngle = (typeof PHOTO_ANGLES)[number];

/** The walk round the car, in order. Index 0 follows index 7. */
export const EXTERIOR_RING: readonly PhotoAngle[] = PHOTO_ANGLES.slice(0, 8);

/**
 * What a photograph shows that the seller may want to state (18 Oct 2026).
 * A suggestion only: the seller confirms it, and it is then THEIR
 * declaration (לפי המוכר), never a verified fact (CLAUDE.md §7). Not seeing
 * something is never evidence that it is absent.
 */
export const PROPERTY_SEEN = ['shelter', 'parking', 'storage', 'elevator', 'balcony', 'renovated', 'needsRenovation'] as const;
export const VEHICLE_COLOURS = [
  'white',
  'black',
  'silver',
  'grey',
  'blue',
  'red',
  'green',
  'brown',
  'beige',
  'yellow',
  'orange',
] as const;

export type PhotoSeen = (typeof PROPERTY_SEEN)[number] | (typeof VEHICLE_COLOURS)[number];

const COMMON = [
  'confidence: a number from 0 to 1.',
  'issues: any of dark, blurry, tilted, sideways, portraitCover, clutter, person, documents, plate, blownWindow, tooClose.',
  'tip: one of openCurtain, stepBack, turnOnLight, straighten, retake, hidePlate, clearClutter.',
  'score: an integer from 1 to 5. 5 is the best cover photograph.',
];

export const PHOTO_REVIEW_SYSTEM = [
  'You label one real-estate photograph. Reply with json only.',
  'Example: {"room":"kitchen","confidence":0.8,"seen":["renovated"],"issues":["dark"],"tip":"turnOnLight","score":3}',
  'room: living, kitchen, bedroom, bathroom, balcony, outdoor, or other.',
  `seen: only what is clearly visible, any of ${PROPERTY_SEEN.join(', ')}. shelter is a reinforced safe room with a steel door. Empty when unsure.`,
  ...COMMON,
].join(' ');

export const VEHICLE_REVIEW_SYSTEM = [
  'You label one photograph of a car for sale. Reply with json only.',
  'Example: {"angle":"frontLeft","confidence":0.8,"seen":["silver"],"issues":["plate"],"tip":"hidePlate","score":4}',
  'angle: where the camera stands, going round the car: front, frontLeft, left, rearLeft, rear, rearRight, right, frontRight.',
  "left is the car's own left side. For a photograph of a part: interior, dashboard, engine, trunk, wheel, or detail.",
  `seen: the body colour when the outside is visible, one of ${VEHICLE_COLOURS.join(', ')}. Empty when unsure.`,
  ...COMMON,
].join(' ');

export const PHOTO_REVIEW_USER = 'Label this photograph.';

export function reviewSystem(category: 'property' | 'vehicle'): string {
  return category === 'vehicle' ? VEHICLE_REVIEW_SYSTEM : PHOTO_REVIEW_SYSTEM;
}

export const REVIEW_ISSUES = [
  'dark',
  'blurry',
  'tilted',
  'sideways',
  'portraitCover',
  'clutter',
  'person',
  'documents',
  'plate',
  'blownWindow',
  'tooClose',
] as const;

export type ReviewIssue = (typeof REVIEW_ISSUES)[number];

export const REVIEW_TIPS = [
  'openCurtain',
  'stepBack',
  'turnOnLight',
  'straighten',
  'retake',
  'hidePlate',
  'clearClutter',
] as const;

export type ReviewTip = (typeof REVIEW_TIPS)[number];

export interface PhotoReview {
  room?: PhotoRoom;
  angle?: PhotoAngle;
  /** Suggestions for the seller, by category; empty when nothing was seen. */
  seen?: PhotoSeen[];
  confidence?: number;
  issues: ReviewIssue[];
  tip?: ReviewTip;
  score?: number;
}

const issueSet = new Set<string>(REVIEW_ISSUES);
const tipSet = new Set<string>(REVIEW_TIPS);

const angleSet = new Set<string>(PHOTO_ANGLES);
const seenFor = {
  property: new Set<string>(PROPERTY_SEEN),
  vehicle: new Set<string>(VEHICLE_COLOURS),
};

/**
 * A model answer. Undefined means no label and no advice. A room is read only
 * for a property and an angle only for a car: a model that calls a car photo
 * "kitchen" has not said anything usable.
 */
export function parsePhotoReview(value: unknown, category: 'property' | 'vehicle' = 'property'): PhotoReview | undefined {
  let parsed: unknown = value;
  if (typeof parsed === 'string') {
    const text = parsed.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try {
      parsed = JSON.parse(text);
    } catch {
      return undefined;
    }
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const record = parsed as Record<string, unknown>;
  const issues = Array.isArray(record.issues)
    ? record.issues.filter((item): item is ReviewIssue => typeof item === 'string' && issueSet.has(item))
    : [];
  const room = category === 'property' && isPhotoRoom(record.room) && record.room !== 'other' ? record.room : undefined;
  const angle =
    category === 'vehicle' && typeof record.angle === 'string' && angleSet.has(record.angle)
      ? (record.angle as PhotoAngle)
      : undefined;
  const allowed = seenFor[category];
  const seen = Array.isArray(record.seen)
    ? [...new Set(record.seen.filter((item): item is PhotoSeen => typeof item === 'string' && allowed.has(item)))]
    : [];
  const confidence = typeof record.confidence === 'number' && record.confidence >= 0 && record.confidence <= 1
    ? record.confidence
    : undefined;
  const tip = typeof record.tip === 'string' && tipSet.has(record.tip) ? (record.tip as ReviewTip) : undefined;
  const score = typeof record.score === 'number' && Number.isInteger(record.score) && record.score >= 1 && record.score <= 5
    ? record.score
    : undefined;
  if (!room && !angle && seen.length === 0 && issues.length === 0 && !tip && score === undefined) return undefined;
  return {
    issues,
    ...(room ? { room } : {}),
    ...(angle ? { angle } : {}),
    ...(seen.length > 0 ? { seen } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
    ...(tip ? { tip } : {}),
    ...(score !== undefined ? { score } : {}),
  };
}

/** Apply a room only when the agent has not named one, and only when sure. */
export function suggestedRoom(review: PhotoReview, current: PhotoRoom | undefined): PhotoRoom | undefined {
  if (current) return undefined;
  if (!review.room || review.confidence === undefined || review.confidence < 0.6) return undefined;
  return review.room;
}
