import { useState } from 'react';

import { MAX_IMAGES } from '@/features/listings/editor';
import { moveItem } from '@/features/listings/photo-order';

import { t } from '../../lib/i18n';
import { Message } from './Message';

export interface EditorPhoto {
  /** Stable across reorders, so React keys do not follow position. */
  id: string;
  /** An object URL. Dies with the tab — see the note on uploading below. */
  url: string;
  name: string;
}

interface Props {
  photos: readonly EditorPhoto[];
  onChange: (photos: EditorPhoto[]) => void;
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
export function PhotosStep({ photos, onChange }: Props) {
  const [dragging, setDragging] = useState<number | null>(null);

  const add = (files: FileList | null) => {
    if (!files) return;

    // Sliced to the cap rather than rejected: someone selecting their whole
    // camera roll should get the first 25, not an error and an empty step.
    const room = MAX_IMAGES - photos.length;
    const taken = [...files].slice(0, Math.max(0, room));

    onChange([
      ...photos,
      ...taken.map((file) => ({
        id: `${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2, 8)}`,
        url: URL.createObjectURL(file),
        name: file.name,
      })),
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

  return (
    <>
      <p className="hint">
        <Message path="editor.photosHint" values={{ max: MAX_IMAGES }} />
      </p>

      {photos.length > 0 ? (
        <ul className="strip">
          {photos.map((photo, index) => (
            <li
              key={photo.id}
              className={dragging === index ? 'shot dragging' : 'shot'}
              draggable
              onDragStart={() => setDragging(index)}
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
              <img src={photo.url} alt="" />

              {index === 0 ? <span className="cover">{t('editor.coverPhoto')}</span> : null}

              <div className="shot-controls">
                {/*
                  "Earlier" means TOWARDS THE RIGHT here, and the labels say
                  so in words rather than with an arrow. An arrow would have
                  to be flipped, and a flipped arrow next to a reordered list
                  is two chances to be wrong instead of one.
                */}
                <button
                  type="button"
                  onClick={() => move(index, index - 1)}
                  disabled={index === 0}
                  aria-label={t('editor.moveEarlier')}
                >
                  {t('editor.earlier')}
                </button>
                <button
                  type="button"
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
            </li>
          ))}
        </ul>
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
