import { PROPERTY_SEEN, VEHICLE_COLOURS } from './photo-review.js';

/**
 * The photo check's instructions to DeepSeek (0037, 0046), apart from
 * photo-review.ts since 19 Oct 2026: the editor imports that module for its
 * allow-lists, and these sentences went to every agent's browser with it.
 * Only /api/photo-review reads them.
 */

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
