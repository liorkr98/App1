import { useState } from 'react';

import type { ListingVideo } from '@/features/listings/rich-media';
import { stripVideoLocation } from '@/features/listings/video-strip';

import { FILM_MIN } from '@/features/listings/ken-burns';
import type { Listing } from '@/types/listing';

import { recordFilm } from '../../lib/film-file';
import { filmPhotos, filmStory } from '../../lib/film-story';
import { listingFromRow, LISTING_COLUMNS, type ListingRow } from '../../lib/listing-row-map';
import { loadShareFonts } from '../../lib/share-draw';
import { t } from '../../lib/i18n';
import { supabase } from '../../lib/supabase';
import type { EditorPhoto } from './PhotosStep';

interface Props {
  photos: readonly EditorPhoto[];
  listingId: string | undefined;
  onVideo: (video: ListingVideo) => void;
}

/** The listing as saved, or undefined when it cannot be read or is not whole yet. */
async function savedListing(listingId: string): Promise<Listing | undefined> {
  try {
    const { data, error } = await supabase().from('listings').select(LISTING_COLUMNS).eq('id', listingId).maybeSingle();
    if (error || !data) return undefined;
    return listingFromRow(data as unknown as ListingRow);
  } catch {
    return undefined;
  }
}

/**
 * Screen 3. One action makes the story file from the photographs. The other
 * accepts a filmed clip and refuses it when the location is still in a live
 * box. Neither blocks the next step.
 */
export function FilmFile({ photos, listingId, onVideo }: Props) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | undefined>(undefined);

  const store = async (
    listing: string,
    stamp: number,
    videoBlob: Blob,
    extension: string,
    contentType: string,
    poster: Blob | undefined,
    video: Omit<ListingVideo, 'url' | 'posterUrl'>,
  ) => {
    const storage = supabase().storage.from('derived');
    const path = `${listing}/browser/video-${stamp}.${extension}`;
    const uploaded = await storage.upload(path, videoBlob, {
      contentType,
      upsert: false,
      cacheControl: '31536000',
    });
    if (uploaded.error) {
      setNote(t('editor.film.failed'));
      return false;
    }
    let posterUrl: string | undefined;
    if (poster) {
      const posterPath = `${listing}/browser/video-${stamp}-poster.webp`;
      const posted = await storage.upload(posterPath, poster, {
        contentType: 'image/webp',
        upsert: false,
        cacheControl: '31536000',
      });
      if (!posted.error) posterUrl = storage.getPublicUrl(posterPath).data.publicUrl;
    }
    onVideo({
      ...video,
      url: storage.getPublicUrl(path).data.publicUrl,
      ...(posterUrl ? { posterUrl } : {}),
    });
    setNote(t('editor.film.ready'));
    return true;
  };

  const make = async () => {
    if (!listingId) {
      setNote(t('editor.film.needSave'));
      return;
    }
    const uploaded = photos.flatMap((photo) => (photo.publicUrl ? [photo.publicUrl] : []));
    if (uploaded.length < FILM_MIN) {
      setNote(t('editor.film.needPhotos')); // "three" in words: FILM_MIN, pinned by ken-burns.test.ts
      return;
    }
    setBusy(true);
    setNote(t('editor.film.working'));
    try {
      // The saved listing gives the film its order, its room names and its
      // words — the same ones the WhatsApp card prints. Without it the film
      // still records, silent of words, from the uploaded photographs.
      const listing = await savedListing(listingId);
      const urls = listing ? filmPhotos(listing).map((photo) => photo.url) : uploaded;
      if (listing) await loadShareFonts();
      const made = await recordFilm(urls, listing ? filmStory(listing) : undefined);
      if (!made) {
        setNote(t('editor.film.failed'));
        return;
      }
      const stored = await store(listingId, Date.now(), made.blob, made.extension, made.blob.type || 'video/mp4', made.poster, {
        width: made.width,
        height: made.height,
        seconds: made.seconds,
        codec: made.codec,
      });
      if (!stored) return;
    } catch {
      setNote(t('editor.film.failed'));
    } finally {
      setBusy(false);
    }
  };

  const uploadClip = async (file: File | undefined) => {
    if (!file || !listingId) {
      if (!listingId) setNote(t('editor.film.needSave'));
      return;
    }
    setBusy(true);
    setNote(undefined);
    try {
      const stripped = stripVideoLocation(new Uint8Array(await file.arrayBuffer()));
      if (!stripped.ok) {
        setNote(
          t(
            stripped.reason === 'location'
              ? 'editor.film.location'
              : stripped.reason === 'too_long'
                ? 'editor.film.tooLong'
                : stripped.reason === 'too_big'
                  ? 'editor.film.tooBig'
                  : 'editor.film.failed',
          ),
        );
        return;
      }
      const copy = stripped.bytes.slice();
      const blob = new Blob([copy.buffer], { type: 'video/mp4' });
      const stored = await store(listingId, Date.now(), blob, 'mp4', 'video/mp4', undefined, {
        width: stripped.width || 1080,
        height: stripped.height || 1920,
        seconds: stripped.seconds,
        codec: stripped.codec,
      });
      if (stored && stripped.codec === 'hevc') setNote(t('editor.film.hevc'));
    } catch {
      setNote(t('editor.film.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="film-file">
      <button type="button" className="secondary" onClick={() => void make()} disabled={busy}>
        {t('editor.film.make')}
      </button>
      <label className="secondary film-file-pick">
        <input
          type="file"
          accept="video/mp4,video/quicktime"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            void uploadClip(file);
          }}
        />
        <span>{t('editor.film.upload')}</span>
      </label>
      {note ? <p className="field-hint">{note}</p> : null}
    </div>
  );
}
