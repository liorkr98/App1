import { useEffect, useRef, useState } from 'react';

import {
  parsePhotoReview,
  suggestedRoom,
  type PhotoReview,
  type ReviewIssue,
  type ReviewTip,
} from '@/features/listings/photo-review';
import type { PhotoRoom } from '@/features/listings/photo-rooms';

import { t } from '../../lib/i18n';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import type { EditorPhoto } from './PhotosStep';

interface Props {
  listingId: string | undefined;
  category: 'property' | 'vehicle';
  photos: readonly EditorPhoto[];
  /** looking: DeepSeek is reading a photograph. no_key: the Worker has no key. */
  status?: 'idle' | 'looking' | 'no_key';
  /** Bumped when a photograph's advice has been stored. */
  refreshKey?: number;
  onLabel: (id: string, room: PhotoRoom) => void;
  onCover: (id: string) => void;
  onRotate: (id: string) => void;
  /** A plate in the picture (CLAUDE.md §7): the agent covers it. */
  onPlate: (id: string) => void;
  /**
   * Every photograph's review, by photo id, whenever one arrives. The
   * editor orders the gallery, builds the 360 and suggests facts from it.
   */
  onReviews?: (reviews: ReadonlyMap<string, PhotoReview>) => void;
}

interface Row {
  photo_path: string;
  room: string | null;
  room_confidence: number | null;
  issues: string[] | null;
  tip: string | null;
  score: number | null;
  angle?: string | null;
  seen?: string[] | null;
}

const review = (row: Row, category: 'property' | 'vehicle') =>
  parsePhotoReview(
    {
      room: row.room,
      angle: row.angle,
      seen: row.seen ?? [],
      confidence: row.room_confidence,
      issues: row.issues ?? [],
      tip: row.tip,
      score: row.score,
    },
    category,
  );

/**
 * Advice from DeepSeek. It never blocks a step. A room the agent already
 * named is left alone.
 */
export function PhotoAdvice({
  listingId,
  category,
  photos,
  status = 'idle',
  refreshKey = 0,
  onLabel,
  onCover,
  onRotate,
  onPlate,
  onReviews,
}: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const applied = useRef(new Set<string>());

  useEffect(() => {
    if (!listingId || !supabaseConfigured) return undefined;
    let stopped = false;

    const look = async () => {
      const client = supabase();
      const columns = 'photo_path, room, room_confidence, issues, tip, score';
      let read: { data: unknown; error: unknown } = await client
        .from('photo_reviews')
        .select(`${columns}, angle, seen`)
        .eq('listing_id', listingId);
      // A database without 0046 has no angle or seen; the advice still reads.
      if (read.error) read = await client.from('photo_reviews').select(columns).eq('listing_id', listingId);
      if (!stopped && !read.error && Array.isArray(read.data)) setRows(read.data as Row[]);
    };

    void look();
    const timer = window.setInterval(() => void look(), 15_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [listingId, refreshKey]);

  useEffect(() => {
    for (const photo of photos) {
      if (!photo.publicUrl || applied.current.has(photo.id)) continue;
      const row = rows.find((item) => photo.publicUrl?.includes(item.photo_path));
      if (!row) continue;
      const parsed = review(row, category);
      const room = parsed ? suggestedRoom(parsed, photo.room) : undefined;
      if (!room) continue;
      applied.current.add(photo.id);
      onLabel(photo.id, room);
    }
  }, [photos, rows, onLabel, category]);

  useEffect(() => {
    if (!onReviews) return;
    const byPhoto = new Map<string, PhotoReview>();
    for (const photo of photos) {
      const row = photo.publicUrl ? rows.find((item) => photo.publicUrl?.includes(item.photo_path)) : undefined;
      const parsed = row ? review(row, category) : undefined;
      if (parsed) byPhoto.set(photo.id, parsed);
    }
    onReviews(byPhoto);
  }, [photos, rows, category, onReviews]);

  if (!listingId) return null;

  const best = rows.reduce<Row | undefined>((winner, row) => {
    if (typeof row.score !== 'number') return winner;
    if (!winner || (winner.score ?? 0) < row.score) return row;
    return winner;
  }, undefined);

  return (
    <div className="photo-advice">
      {status === 'looking' ? <p className="field-hint">{t('editor.photoReview.looking')}</p> : null}
      {status === 'no_key' ? <p className="field-hint">{t('editor.photoReview.noKey')}</p> : null}
      {photos.map((photo) => {
        const row = photo.publicUrl ? rows.find((item) => photo.publicUrl?.includes(item.photo_path)) : undefined;
        const advice = row ? review(row, category) : undefined;
        if (!advice || (advice.issues.length === 0 && !advice.tip)) return null;
        const cover = best && row && best.photo_path === row.photo_path && photos[0]?.id !== photo.id;
        return (
          <p key={photo.id} className="field-hint">
            {advice.issues.map((issue: ReviewIssue) => (
              <span key={issue} className="photo-advice-chip">{t(`editor.photoReview.issues.${issue}`)}</span>
            ))}
            {advice.tip ? <span>{t(`editor.photoReview.tips.${advice.tip as ReviewTip}`)}</span> : null}
            {cover ? (
              <button type="button" className="quiet" onClick={() => onCover(photo.id)}>
                {t('editor.photoReview.cover')}
              </button>
            ) : null}
            {advice.issues.includes('plate') ? (
              <button type="button" className="quiet" onClick={() => onPlate(photo.id)}>
                {t('editor.photoReview.coverPlate')}
              </button>
            ) : null}
            {advice.issues.includes('sideways') ? (
              <button type="button" className="quiet" onClick={() => onRotate(photo.id)}>
                {t('editor.photoReview.rotate')}
              </button>
            ) : null}
          </p>
        );
      })}
    </div>
  );
}
