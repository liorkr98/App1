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

export const PHOTO_REVIEW_SYSTEM = [
  'You label one real-estate photograph. Reply with json only.',
  'Example: {"room":"kitchen","confidence":0.8,"issues":["dark"],"tip":"turnOnLight","score":3}',
  'room: living, kitchen, bedroom, bathroom, balcony, outdoor, or other.',
  'confidence: a number from 0 to 1.',
  'issues: any of dark, blurry, tilted, sideways, portraitCover, clutter, person, documents, plate, blownWindow, tooClose.',
  'tip: one of openCurtain, stepBack, turnOnLight, straighten, retake, hidePlate, clearClutter.',
  'score: an integer from 1 to 5. 5 is the best cover photograph.',
].join(' ');

export const PHOTO_REVIEW_USER = 'Label this photograph.';

import { isPhotoRoom, type PhotoRoom } from './photo-rooms.js';

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
  confidence?: number;
  issues: ReviewIssue[];
  tip?: ReviewTip;
  score?: number;
}

const issueSet = new Set<string>(REVIEW_ISSUES);
const tipSet = new Set<string>(REVIEW_TIPS);

/** A model answer. Undefined means no label and no advice. */
export function parsePhotoReview(value: unknown): PhotoReview | undefined {
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
  const room = isPhotoRoom(record.room) && record.room !== 'other' ? record.room : undefined;
  const confidence = typeof record.confidence === 'number' && record.confidence >= 0 && record.confidence <= 1
    ? record.confidence
    : undefined;
  const tip = typeof record.tip === 'string' && tipSet.has(record.tip) ? (record.tip as ReviewTip) : undefined;
  const score = typeof record.score === 'number' && Number.isInteger(record.score) && record.score >= 1 && record.score <= 5
    ? record.score
    : undefined;
  if (!room && issues.length === 0 && !tip && score === undefined) return undefined;
  return {
    issues,
    ...(room ? { room } : {}),
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
