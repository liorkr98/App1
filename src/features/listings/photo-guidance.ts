/**
 * Warnings about the photographs. They never block publishing — a page
 * with six photos still ships — they tell the agent what a buyer will notice.
 */

export interface GuidedPhoto {
  width?: number;
  height?: number;
}

export type PhotoWarning = 'few' | 'portraitCover' | 'narrow' | 'overCap';

export function photoWarnings(photos: readonly GuidedPhoto[]): PhotoWarning[] {
  const found: PhotoWarning[] = [];
  if (photos.length > 0 && photos.length < 8) found.push('few');
  if (photos.length > 25) found.push('overCap');

  const cover = photos[0];
  if (cover?.width && cover.height && cover.height > cover.width) found.push('portraitCover');
  if (photos.some((photo) => photo.width !== undefined && photo.width > 0 && photo.width < 1200)) {
    found.push('narrow');
  }
  return found;
}

/** First landscape frame, or 0 when every frame is portrait or unmeasured. */
export function preferredCoverIndex(photos: readonly GuidedPhoto[]): number {
  const landscape = photos.findIndex(
    (photo) =>
      photo.width !== undefined &&
      photo.height !== undefined &&
      photo.width >= photo.height &&
      photo.width > 0,
  );
  return landscape === -1 ? 0 : landscape;
}
