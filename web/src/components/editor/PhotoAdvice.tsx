import { useEffect, useRef, useState } from 'react';

import { parsePhotoReview, suggestedRoom, type ReviewIssue, type ReviewTip } from '@/features/listings/photo-review';
import type { PhotoRoom } from '@/features/listings/photo-rooms';

import { t } from '../../lib/i18n';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import type { EditorPhoto } from './PhotosStep';

interface Props {
  listingId: string | undefined;
  photos: readonly EditorPhoto[];
  onLabel: (id: string, room: PhotoRoom) => void;
  onCover: (id: string) => void;
  onRotate: (id: string) => void;
}

interface Row {
  photo_path: string;
  room: string | null;
  room_confidence: number | null;
  issues: string[] | null;
  tip: string | null;
  score: number | null;
}

const WAIT_MS = 3 * 60 * 1000;

/**
 * Advice from the Mac, when it is on. It never blocks a step. A room the
 * agent already named is left alone.
 */
export function PhotoAdvice({ listingId, photos, onLabel, onCover, onRotate }: Props) {
  const [waiting, setWaiting] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const applied = useRef(new Set<string>());

  useEffect(() => {
    if (!listingId || !supabaseConfigured) return undefined;
    let stopped = false;

    const look = async () => {
      const client = supabase();
      const { data } = await client
        .from('photo_reviews')
        .select('photo_path, room, room_confidence, issues, tip, score')
        .eq('listing_id', listingId);
      if (!stopped && Array.isArray(data)) setRows(data as Row[]);

      const { data: jobs } = await client
        .from('jobs')
        .select('status, created_at')
        .eq('listing_id', listingId)
        .eq('job_type', 'review_photos')
        .eq('status', 'queued');
      const old = (jobs ?? []).some((job) => {
        const created = Date.parse(String((job as { created_at?: string }).created_at ?? ''));
        return Number.isFinite(created) && Date.now() - created > WAIT_MS;
      });
      if (!stopped) setWaiting(old);
    };

    void look();
    const timer = window.setInterval(() => void look(), 15_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [listingId]);

  useEffect(() => {
    for (const photo of photos) {
      if (!photo.publicUrl || applied.current.has(photo.id)) continue;
      const row = rows.find((item) => photo.publicUrl?.includes(item.photo_path));
      if (!row) continue;
      const review = parsePhotoReview({
        room: row.room,
        confidence: row.room_confidence,
        issues: row.issues ?? [],
        tip: row.tip,
        score: row.score,
      });
      const room = review ? suggestedRoom(review, photo.room) : undefined;
      if (!room) continue;
      applied.current.add(photo.id);
      onLabel(photo.id, room);
    }
  }, [photos, rows, onLabel]);

  if (!listingId) return null;

  const best = rows.reduce<Row | undefined>((winner, row) => {
    if (typeof row.score !== 'number') return winner;
    if (!winner || (winner.score ?? 0) < row.score) return row;
    return winner;
  }, undefined);

  return (
    <div className="photo-advice">
      {waiting ? <p className="field-hint">{t('editor.review.waiting')}</p> : null}
      {photos.map((photo) => {
        const row = photo.publicUrl ? rows.find((item) => photo.publicUrl?.includes(item.photo_path)) : undefined;
        const review = row
          ? parsePhotoReview({
              room: row.room,
              confidence: row.room_confidence,
              issues: row.issues ?? [],
              tip: row.tip,
              score: row.score,
            })
          : undefined;
        if (!review || (review.issues.length === 0 && !review.tip)) return null;
        const cover = best && row && best.photo_path === row.photo_path && photos[0]?.id !== photo.id;
        return (
          <p key={photo.id} className="field-hint">
            {review.issues.map((issue: ReviewIssue) => (
              <span key={issue} className="photo-advice-chip">{t(`editor.review.issues.${issue}`)}</span>
            ))}
            {review.tip ? <span>{t(`editor.review.tips.${review.tip as ReviewTip}`)}</span> : null}
            {cover ? (
              <button type="button" className="quiet" onClick={() => onCover(photo.id)}>
                {t('editor.review.cover')}
              </button>
            ) : null}
            {review.issues.includes('sideways') ? (
              <button type="button" className="quiet" onClick={() => onRotate(photo.id)}>
                {t('editor.review.rotate')}
              </button>
            ) : null}
          </p>
        );
      })}
    </div>
  );
}
