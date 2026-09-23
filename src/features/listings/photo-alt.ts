import type { PhotoRoom } from './photo-rooms.js';

/**
 * Alt text for a listing photograph.
 *
 * Prefer the seller's alt when they wrote one. Otherwise room label + caption,
 * so a screen reader still hears "סלון · מבט למרפסת" rather than an empty
 * string. Never invent a room name the seller did not attach.
 */
export function photoAlt(
  image: { alt?: string; caption?: string; room?: PhotoRoom },
  roomLabel?: string,
): string {
  const written = image.alt?.trim();
  if (written) return written;
  const parts = [roomLabel?.trim(), image.caption?.trim()].filter(
    (part): part is string => Boolean(part),
  );
  return parts.join(' · ');
}
