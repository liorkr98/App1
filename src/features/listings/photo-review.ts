/**
 * What the Mac may write about a photograph, and nothing else.
 *
 * Hebrew is not in here. The model returns one of these keys; the editor
 * reads the sentence from locales/. An answer that is not one of these keys
 * is dropped, never guessed into a label.
 */

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
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
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
