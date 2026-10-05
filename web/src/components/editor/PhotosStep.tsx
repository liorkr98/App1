import { useLayoutEffect, useRef, useState } from 'react';
import type { AccentId } from '@/features/agents/accents';
import { photoFlags, suggestedOrder, type PhotoCheck } from '@/features/listings/photo-quality';

import { MAX_IMAGES } from '@/features/listings/editor';
import { photoWarnings } from '@/features/listings/photo-guidance';
import { guessRoomFromName, type PhotoRoom } from '@/features/listings/photo-rooms';
import { moveItem } from '@/features/listings/photo-order';
import type { ListingCategory } from '@/features/listings/schemas';

import { t } from '../../lib/i18n';
import { Message } from './Message';

export interface EditorPhoto {
  /** Stable across reorders, so React keys do not follow position. */
  id: string;
  /** An object URL, for showing the picture before it has gone anywhere. */
  url: string;
  name: string;
  /** The File itself, kept so it can be uploaded. */
  file?: File;

  /**
   * The PUBLIC copy's URL, once one exists.
   *
   * The original goes to the private `originals` bucket and can never be
   * shown to a buyer. This is the re-encoded copy in `derived` — the only URL
   * a listing page can carry. Absent until the upload finishes, which is why
   * `saveListing` filters on it rather than assuming.
   */
  publicUrl?: string;
  /** Of the public copy, so the page can reserve the box before the bytes. */
  width?: number;
  height?: number;

  /**
   * Where this photo is in its journey to the private originals bucket.
   *
   * Shown per thumbnail rather than as one global spinner: an agent adding
   * fifteen photos on a train needs to know WHICH of them failed, not that
   * something did.
   */
  status?: 'local' | 'uploading' | 'uploaded' | 'failed';
  /** Storage key inside `originals`, once it has one. */
  path?: string;

  /**
   * Optional description for screen readers and the published <img alt>.
   *
   * Empty is the correct value when nobody wrote one — inventing a caption
   * from the file name would be worse than silence. Not required to publish.
   */
  alt?: string;

  /**
   * Which room this is, when the seller named one. Property only — a car
   * has no rooms, and the picker is not shown for one.
   */
  room?: PhotoRoom;

  /** On-device quality measurement, when this browser could make one. */
  check?: PhotoCheck;

  /** The accent this photo suggests when it is the cover (cover-accent.ts). */
  tone?: AccentId;
}

interface Props {
  photos: readonly EditorPhoto[];
  onChange: (photos: EditorPhoto[]) => void;
  /** Uploading needs a listing row, which needs a signed-in owner (0004). */
  signedIn: boolean;
  category?: ListingCategory;
}

/**
 * Choosing and ordering the photographs.
 *
 * NOTHING IS UPLOADED YET. These are local object URLs and they die with the
 * tab.
 *
 * Where they will go is decided: Supabase Storage (CLAUDE.md §2), into the
 * private `originals` bucket that migration 0004 already creates. What is
 * still missing is the signed upload — which needs a Supabase URL and key
 * this session has no business holding — and the listing id to scope the path
 * to, which does not exist until the draft is saved server-side.
 *
 * Everything else about this step is independent of where the bytes land:
 * picking, ordering, the cover, the cap.
 *
 * ============================ THE RTL TRAP ============================
 * CLAUDE.md §4.4. In RTL the FIRST item is the RIGHTMOST. Index 0 is on the
 * right, and index 0 is the cover — the single image the WhatsApp card is
 * cut from. Get it wrong and the seller finds out after the link has gone to
 * thirty people.
 *
 * The array is direction-agnostic: moveItem is a plain splice, and the model
 * order IS the publication order. The danger is only ever in converting a
 * pointer position into an index.
 *
 * SO THIS DOES NOT CONVERT ONE. The drop target is the thumbnail underneath
 * the pointer, and a thumbnail already knows its own model index — the
 * browser does the hit-testing, and it gets RTL right by construction.
 *
 * That means `indexFromPointer` is deliberately NOT used here, despite being
 * written for this screen. It divides the container width into equal slots,
 * which is only true of a single row spanning the full width. This grid wraps
 * and can scroll, so x/width would address the wrong item as soon as there
 * were more than one row — a tested helper applied to a layout its assumption
 * does not hold for. It stays for a strip that does span the width; the tests
 * that pin the RTL formula stay with it.
 * ======================================================================
 *
 * Dragging is not the only way to reorder. Each photo carries two move
 * buttons, because a drag is unusable with a keyboard and unreliable with a
 * thumb on a moving bus — and because the buttons make the order checkable
 * without a pointer at all.
 */
export function PhotosStep({
  photos,
  onChange,
  signedIn,
  category,
}: Props) {
  const [dragging, setDragging] = useState<number | null>(null);
  const strip = useFlip(photos.map((photo) => photo.id).join('|'));
  const warnings = photoWarnings(photos);
  const warningCopy: Record<(typeof warnings)[number], string> = {
    few: t('editor.photosWarnFew'),
    portraitCover: t('editor.photosWarnPortrait'),
    narrow: t('editor.photosWarnNarrow'),
    overCap: t('editor.photosWarnCap'),
  };

  const add = (files: FileList | null) => {
    if (!files) return;

    // Sliced to the cap rather than rejected: someone selecting their whole
    // camera roll should get the first 25, not an error and an empty step.
    const room = MAX_IMAGES - photos.length;
    const taken = [...files].slice(0, Math.max(0, room));

    onChange([
      ...photos,
      ...taken.map((file) => {
        const guessed = guessRoomFromName(file.name);
        return {
          id: `${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2, 8)}`,
          url: URL.createObjectURL(file),
          name: file.name,
          file,
          status: 'local' as const,
          ...(guessed && category === 'property' ? { room: guessed } : {}),
        };
      }),
    ]);
  };

  const remove = (index: number) => {
    const going = photos[index];
    // Object URLs are held by the browser until revoked. On a phone, 25 of
    // them left behind on every edit is a real leak.
    if (going) URL.revokeObjectURL(going.url);
    onChange(photos.filter((_, at) => at !== index));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length) return;
    onChange(moveItem(photos, from, to));
  };

  // Advice per thumbnail: dark, blurry, small, or the same shot twice (the
  // later copy is the one flagged). Never a blocker.
  const flags = photos.map((photo, index) =>
    photo.check
      ? photoFlags(
          photo.check,
          photos.slice(0, index).flatMap((earlier) => (earlier.check ? [earlier.check.hash] : [])),
        )
      : [],
  );

  return (
    <>
      <p className="hint">
        <Message path="editor.photosHint" values={{ max: MAX_IMAGES }} />
        {' '}
        <a href="/guide/photos/">{t('editor.photosGuide')}</a>
      </p>
      <ul className="photo-rules">
        <li>{t('guide.before1')}</li>
        <li>{t('guide.before2')}</li>
        <li>{t('guide.before3')}</li>
        <li>{t('guide.before4')}</li>
      </ul>
      <details className="photo-rules-more">
        <summary className="rules-toggle">{t('listing.readMore')}</summary>
        <ul>
          <li>{t('guide.shoot1')}</li>
          <li>{t('guide.shoot2')}</li>
          <li>{t('guide.shoot3')}</li>
          <li>{t('guide.shoot4')}</li>
          <li>{t('guide.cover1')}</li>
        </ul>
      </details>
      {warnings.length > 0 && (
        <ul className="photo-warn">
          {warnings.map((warning) => (
            <li key={warning}>{warningCopy[warning]}</li>
          ))}
        </ul>
      )}

      {photos.length > 1 ? (
        <div className="order-tools">
          <button
            type="button"
            className="order-suggest"
            onClick={() => onChange(suggestedOrder(photos))}
          >
            ✦ {t('editor.quality.suggestOrder')}
          </button>
          <span className="hint">{t('editor.quality.suggestOrderHint')}</span>
        </div>
      ) : null}

      {photos.length > 0 ? (
        <ul className="strip" ref={strip}>
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              data-id={photo.id}
              className={[
                'shot',
                dragging === index ? 'dragging' : '',
                photo.status ? `is-${photo.status}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              draggable
              onDragStart={(event) => {
                // An input inside a draggable tile would otherwise start a
                // reorder the moment the seller tries to type an alt.
                if ((event.target as HTMLElement).closest('input, select, label')) {
                  event.preventDefault();
                  return;
                }
                setDragging(index);
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                // `index` is this thumbnail's own model index. No pointer
                // arithmetic, so no direction to get wrong.
                if (dragging !== null) move(dragging, index);
                setDragging(null);
              }}
            >
              <img
                className={photo.status === 'uploaded' ? 'clip-reveal' : undefined}
                src={photo.url}
                alt={photo.alt?.trim() ?? ''}
              />

              {index === 0 ? <span className="cover">{t('editor.coverPhoto')}</span> : null}

              {flags[index] && flags[index]!.length > 0 ? (
                <span className="shot-flags">
                  {flags[index]!.map((flag) => (
                    <span key={flag} className={`shot-flag flag-${flag}`}>
                      {t(`editor.quality.${flag}`)}
                    </span>
                  ))}
                </span>
              ) : null}

              {photo.status === 'failed' && photo.file ? (
                // The photo is still in memory: setting it back to 'local'
                // is all a retry needs, the editor uploads what is local.
                <button
                  type="button"
                  className="shot-state failed shot-retry"
                  onClick={() =>
                    onChange(
                      photos.map((item) =>
                        item.id === photo.id ? { ...item, status: 'local' as const } : item,
                      ),
                    )
                  }
                >
                  {t('editor.uploadRetry')}
                </button>
              ) : photo.status && photo.status !== 'uploaded' ? (
                <span className={`shot-state ${photo.status}`}>
                  {t(
                    photo.status === 'uploading'
                      ? 'editor.uploading'
                      : photo.status === 'failed'
                        ? 'editor.uploadFailed'
                        : 'editor.notUploaded',
                  )}
                </span>
              ) : null}

              {photo.status === 'uploading' ? <span className="shot-progress" aria-hidden="true" /> : null}

              {/* Only for a photo picked in this visit (it still has its
                  file): one check that pulses as it lands. A listing opened
                  from the dashboard does not flash a check on every tile. */}
              {photo.status === 'uploaded' && photo.file ? (
                <span className="shot-done" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
              ) : null}

              <div className="shot-controls">
                {/*
                  "Earlier" means TOWARDS THE RIGHT here, and the labels say
                  so in words rather than with an arrow. An arrow would have
                  to be flipped, and a flipped arrow next to a reordered list
                  is two chances to be wrong instead of one.
                */}
                <button
                  type="button"
                  className="shot-move"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={t('editor.moveEarlier')}
                >
                  {t('editor.earlier')}
                </button>
                <button
                  type="button"
                  className="shot-move"
                  onClick={() => move(index, index + 1)}
                  disabled={index === photos.length - 1}
                  aria-label={t('editor.moveLater')}
                >
                  {t('editor.later')}
                </button>
                <button
                  type="button"
                  className="shot-remove"
                  onClick={() => remove(index)}
                  aria-label={t('common.delete')}
                >
                  {t('common.delete')}
                </button>
              </div>

              <label className="shot-alt">
                <input
                  type="text"
                  value={photo.alt ?? ''}
                  placeholder={t('editor.photoAlt')}
                  aria-label={t('editor.photoAlt')}
                  title={t('editor.photoAltHint')}
                  autoComplete="off"
                  draggable={false}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    const alt = event.target.value;
                    onChange(
                      photos.map((item, at) => (at === index ? { ...item, alt } : item)),
                    );
                  }}
                />
              </label>

            </li>
          ))}
        </ul>
      ) : null}

      {!signedIn ? (
        <p className="note">
          <a href="/enter/">{t('editor.signInToUpload')}</a>
        </p>
      ) : null}

      <label className="picker">
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={photos.length >= MAX_IMAGES}
          onChange={(event) => {
            add(event.target.files);
            // Cleared so picking the same file twice still fires a change.
            event.target.value = '';
          }}
        />
        <span>{t('editor.addPhotos')}</span>
      </label>

      <p className="note">
        <Message path="editor.photoCount" values={{ count: photos.length, max: MAX_IMAGES }} />
      </p>
    </>
  );
}

/**
 * Reordering animates: the photos that moved glide to their new places
 * instead of jumping (FLIP — measure, then animate the difference back to
 * zero). Transform only, so nothing else on the page shifts, and nothing at
 * all for a reader who asked for less motion.
 *
 * Keyed on the ORDER of ids, so a status change on one tile (uploading →
 * uploaded) does not read as a move. Positions are measured, not computed
 * from indexes, so RTL needs no special case: whichever way the tile went on
 * screen is the way it glides.
 */
function useFlip(order: string) {
  const list = useRef<HTMLUListElement>(null);
  const last = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const node = list.current;
    const before = last.current;
    const after = new Map<string, DOMRect>();
    if (!node) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    for (const item of node.querySelectorAll<HTMLElement>(':scope > li[data-id]')) {
      const id = item.dataset.id ?? '';
      const rect = item.getBoundingClientRect();
      after.set(id, rect);
      const was = before.get(id);
      if (!was || still || typeof item.animate !== 'function') continue;
      const dx = was.left - rect.left;
      const dy = was.top - rect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: 260,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      });
    }
    last.current = after;
  }, [order]);

  return list;
}
