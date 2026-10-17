import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
 *
 * The drag itself is pointer events, not HTML5 drag-and-drop (15 Oct 2026):
 * the HTML5 kind never fires for a finger, so on the phone most agents build
 * on, the photos could not be dragged at all. See usePhysicalOrder below.
 */
export function PhotosStep({
  photos,
  onChange,
  signedIn,
  category,
}: Props) {
  const drag = usePhysicalOrder(photos, onChange);
  // While a photo is held, the grid shows where it would land; the editor
  // hears about the order once, when it is let go.
  const shown = drag.order
    ? drag.order.flatMap((id) => photos.filter((photo) => photo.id === id))
    : photos;
  const strip = useFlip(shown.map((photo) => photo.id).join('|'), drag.lifted);
  // A flat gets the room checklist under this step (PhotoChecklist), which
  // owns the "how many" advice; the flat eight is for a car.
  const warnings = photoWarnings(photos).filter((warning) => category !== 'property' || warning !== 'few');
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
  const flags = shown.map((photo, index) =>
    photo.check
      ? photoFlags(
          photo.check,
          shown.slice(0, index).flatMap((earlier) => (earlier.check ? [earlier.check.hash] : [])),
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
      {/*
        The one big button first (11 Oct 2026): an agent who is not
        technical should see what to press before anything to read. On a
        phone it opens the camera or the gallery, the phone's own choice.
      */}
      <label className={photos.length === 0 ? 'picker picker-big' : 'picker'}>
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
        {photos.length === 0 ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="picker-icon">
            <path d="M9 4l-1.5 2H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-3.5L15 4H9zm3 4.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zm0 2a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />
          </svg>
        ) : null}
        <span>{photos.length === 0 ? t('editor.flow.addPhotosBig') : t('editor.addPhotos')}</span>
      </label>

      {!signedIn ? (
        <p className="note">
          <a href="/enter/">{t('editor.signInToUpload')}</a>
        </p>
      ) : null}

      {/* The shooting advice, folded: worth having, not worth reading
          before the first photo is in. */}
      <details className="photo-rules-more">
        <summary className="rules-toggle">{t('editor.flow.photoTips')}</summary>
        <ul>
          <li>{t('guide.before1')}</li>
          <li>{t('guide.before2')}</li>
          <li>{t('guide.before3')}</li>
          <li>{t('guide.before4')}</li>
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
        <ul className={drag.lifted ? 'strip sorting' : 'strip'} ref={strip}>
          {shown.map((photo, index) => (
            <li
              key={photo.id}
              data-id={photo.id}
              className={[
                'shot',
                drag.lifted === photo.id ? 'lifted' : '',
                photo.status ? `is-${photo.status}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onPointerDown={(event) => drag.start(event, strip.current)}
            >
              <img
                className={photo.status === 'uploaded' ? 'clip-reveal' : undefined}
                src={photo.url}
                alt={photo.alt?.trim() ?? ''}
                draggable={false}
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

      {photos.length > 1 ? <p className="hint order-how">{t('editor.dragToReorder')}</p> : null}

      <p className="note">
        <Message path="editor.photoCount" values={{ count: photos.length, max: MAX_IMAGES }} />
      </p>
    </>
  );
}

/**
 * A photo you can pick up (15 Oct 2026).
 *
 * A finger holds a photo for a moment and it lifts; it then follows the
 * finger, and the others slide out of its way as it passes them; let go and
 * it settles into the gap. A mouse lifts it on the first few pixels of
 * movement instead, since a mouse has no scrolling to tell apart from a drag.
 *
 * THE HOLD is what keeps scrolling working. A finger that moves before the
 * hold is up is scrolling the page, and is left alone. Once the photo is
 * lifted, touchmove is cancelled on the document so the page stays put
 * under it, and the page scrolls itself near the top and bottom edges
 * instead: 25 photos on a phone are taller than the screen.
 *
 * RTL is still not computed anywhere (see the comment on PhotosStep). The
 * target is the tile whose LAID-OUT box holds the pointer, measured from
 * offsetLeft/offsetTop, which ignore transforms. Hit-testing what is drawn
 * would catch a neighbour mid-glide and swap the pair back and forth.
 */
interface Held {
  id: string;
  pointerId: number;
  touch: boolean;
  el: HTMLElement;
  strip: HTMLUListElement;
  /** Where the pointer went down, for the movement thresholds. */
  startX: number;
  startY: number;
  /** The pointer's offset inside the tile when it was picked up. */
  grabX: number;
  grabY: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  live: boolean;
  order: string[];
  timer: number;
  frame: number;
  /** Removes the listeners this hold added, whichever render added them. */
  detach: () => void;
}

/** A tile's box as laid out, before any transform, in viewport pixels. */
function laidOut(el: HTMLElement, strip: HTMLElement) {
  const base = strip.getBoundingClientRect();
  return {
    x: base.left + strip.clientLeft + el.offsetLeft,
    y: base.top + strip.clientTop + el.offsetTop,
    width: el.offsetWidth,
    height: el.offsetHeight,
  };
}

const HOLD_MS = 260;
const SLOP_TOUCH = 10;
const SLOP_MOUSE = 5;
const EDGE = 72;

function usePhysicalOrder(photos: readonly EditorPhoto[], onChange: (photos: EditorPhoto[]) => void) {
  const [lifted, setLifted] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const held = useRef<Held | null>(null);
  const latest = useRef({ photos, onChange });
  latest.current = { photos, onChange };

  const follow = (state: Held) => {
    const box = laidOut(state.el, state.strip);
    state.tx = state.x - state.grabX - box.x;
    state.ty = state.y - state.grabY - box.y;
    state.el.style.transform = `translate(${state.tx}px, ${state.ty}px)`;
  };

  const retarget = (state: Held) => {
    for (const item of state.strip.querySelectorAll<HTMLElement>(':scope > li[data-id]')) {
      const id = item.dataset.id ?? '';
      if (id === state.id) continue;
      const box = laidOut(item, state.strip);
      if (state.x < box.x || state.x > box.x + box.width) continue;
      if (state.y < box.y || state.y > box.y + box.height) continue;
      const to = state.order.indexOf(id);
      const from = state.order.indexOf(state.id);
      if (to < 0 || from < 0) return;
      state.order = moveItem(state.order, from, to);
      setOrder(state.order);
      return;
    }
  };

  // The grid re-rendered in the new order, so the held tile's slot moved:
  // put it back under the finger before the frame is painted.
  useLayoutEffect(() => {
    const state = held.current;
    if (state?.live) follow(state);
  }, [order]);

  const lift = (state: Held) => {
    state.live = true;
    const box = laidOut(state.el, state.strip);
    state.grabX = state.startX - box.x;
    state.grabY = state.startY - box.y;
    setLifted(state.id);
    setOrder(state.order);
    follow(state);
    // A small tick on the phones that have one: the photo is in your hand.
    if (state.touch) navigator.vibrate?.(8);
    const scroll = () => {
      const current = held.current;
      if (!current?.live) return;
      const { y } = current;
      const speed =
        y < EDGE ? -((EDGE - y) / EDGE) * 14 : y > innerHeight - EDGE ? ((y - (innerHeight - EDGE)) / EDGE) * 14 : 0;
      if (speed !== 0) {
        scrollBy(0, speed);
        follow(current);
        retarget(current);
      }
      current.frame = requestAnimationFrame(scroll);
    };
    state.frame = requestAnimationFrame(scroll);
  };

  const finish = (keep: boolean) => {
    const state = held.current;
    held.current = null;
    if (!state) return;
    clearTimeout(state.timer);
    cancelAnimationFrame(state.frame);
    state.detach();
    if (!state.live) return;

    state.el.style.transform = '';
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!still && typeof state.el.animate === 'function' && keep) {
      state.el.animate([{ transform: `translate(${state.tx}px, ${state.ty}px)` }, { transform: 'none' }], {
        duration: 220,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
      });
    }
    setLifted(null);
    setOrder(null);
    if (!keep) return;

    const { photos: now, onChange: tell } = latest.current;
    const next = [
      ...state.order.flatMap((id) => now.filter((photo) => photo.id === id)),
      ...now.filter((photo) => !state.order.includes(photo.id)),
    ];
    if (next.some((photo, index) => photo.id !== now[index]?.id)) tell(next);
  };

  const onMove = (event: PointerEvent) => {
    const state = held.current;
    if (!state || event.pointerId !== state.pointerId) return;
    state.x = event.clientX;
    state.y = event.clientY;
    if (!state.live) {
      const moved = Math.hypot(state.x - state.startX, state.y - state.startY);
      if (state.touch) {
        // Moved before the hold was up: that is a scroll, not a pick-up.
        if (moved > SLOP_TOUCH) finish(false);
        return;
      }
      if (moved < SLOP_MOUSE) return;
      lift(state);
    }
    follow(state);
    retarget(state);
  };
  const onUp = (event: PointerEvent) => {
    if (event.pointerId === held.current?.pointerId) finish(true);
  };
  const onCancel = (event: PointerEvent) => {
    if (event.pointerId === held.current?.pointerId) finish(false);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') finish(false);
  };
  // Once lifted, the page must not scroll under the finger, and a long
  // press must not open the image menu.
  const onTouchMove = (event: TouchEvent) => {
    if (held.current?.live && event.cancelable) event.preventDefault();
  };
  const onMenu = (event: Event) => {
    if (held.current) event.preventDefault();
  };

  const attach = () => {
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onCancel);
    addEventListener('keydown', onKey);
    addEventListener('contextmenu', onMenu);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  };
  const detach = () => {
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onCancel);
    removeEventListener('keydown', onKey);
    removeEventListener('contextmenu', onMenu);
    document.removeEventListener('touchmove', onTouchMove);
  };

  // Leaving the step mid-drag leaves nothing listening.
  useEffect(
    () => () => {
      const state = held.current;
      held.current = null;
      if (!state) return;
      clearTimeout(state.timer);
      cancelAnimationFrame(state.frame);
      state.detach();
    },
    [],
  );

  const start = (event: ReactPointerEvent<HTMLLIElement>, strip: HTMLUListElement | null) => {
    if (held.current || !strip || !event.isPrimary || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button, input, select, label, a')) return;
    const touch = event.pointerType !== 'mouse';
    const state: Held = {
      id: event.currentTarget.dataset.id ?? '',
      pointerId: event.pointerId,
      touch,
      el: event.currentTarget,
      strip,
      startX: event.clientX,
      startY: event.clientY,
      grabX: 0,
      grabY: 0,
      x: event.clientX,
      y: event.clientY,
      tx: 0,
      ty: 0,
      live: false,
      order: latest.current.photos.map((photo) => photo.id),
      timer: 0,
      frame: 0,
      detach,
    };
    held.current = state;
    attach();
    // A mouse would otherwise start selecting the captions it passes over.
    if (!touch) event.preventDefault();
    if (touch) {
      state.timer = window.setTimeout(() => {
        if (held.current === state) lift(state);
      }, HOLD_MS);
    }
  };

  return { lifted, order, start };
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
 *
 * Measured as laid out (offsetLeft/offsetTop), so a tile still gliding, or
 * the one in the agent's hand, is measured where it sits, not where it is
 * drawn. The held tile is not animated: it is wherever the finger is.
 */
function useFlip(order: string, held: string | null) {
  const list = useRef<HTMLUListElement>(null);
  const last = useRef(new Map<string, { x: number; y: number }>());

  useLayoutEffect(() => {
    const node = list.current;
    const before = last.current;
    const after = new Map<string, { x: number; y: number }>();
    if (!node) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    for (const item of node.querySelectorAll<HTMLElement>(':scope > li[data-id]')) {
      const id = item.dataset.id ?? '';
      const now = { x: item.offsetLeft, y: item.offsetTop };
      after.set(id, now);
      const was = before.get(id);
      if (!was || still || id === held || typeof item.animate !== 'function') continue;
      const dx = was.x - now.x;
      const dy = was.y - now.y;
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
