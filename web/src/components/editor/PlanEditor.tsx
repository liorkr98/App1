import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { PHOTO_ROOMS, type PhotoRoom } from '@/features/listings/photo-rooms';
import { cleanPlanRooms, PLAN_ROOM_MIN, type PlanRoom } from '@/features/listings/rich-media';

import { t } from '../../lib/i18n';

export interface PlanDraft {
  url: string;
  width: number;
  height: number;
  rooms: PlanRoom[];
}

interface Props {
  plan: PlanDraft | undefined;
  onPlan: (plan: PlanDraft | undefined) => void;
  /** Uploads the plan image through the same EXIF-stripping path as photos. */
  onUpload: (file: File) => Promise<void>;
  uploading: boolean;
}

/**
 * The floor plan, and the rooms drawn on it (P7, "חדר בלחיצה").
 *
 * Choose a room, then drag a rectangle over it on the plan. On the page
 * (Blueprint) each rectangle becomes a button that opens that room's
 * photographs. One rectangle per room; drawing a room again replaces it.
 *
 * COORDINATES ARE LOGICAL. x is measured from the INLINE-START edge — the
 * right, in Hebrew — so the page can place the button with
 * inset-inline-start and never a physical `left` (CLAUDE.md §4.1).
 * Percent of the image, so it survives any size the plan is shown at.
 */
const ROOMS = PHOTO_ROOMS.filter((room) => room !== 'other');

export function PlanEditor({ plan, onPlan, onUpload, uploading }: Props) {
  const [room, setRoom] = useState<PhotoRoom>('living');
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const point = (event: ReactPointerEvent) => {
    const rect = box.current!.getBoundingClientRect();
    const fromStart = (rect.right - event.clientX) / rect.width;
    const fromTop = (event.clientY - rect.top) / rect.height;
    return {
      x: Math.min(100, Math.max(0, fromStart * 100)),
      y: Math.min(100, Math.max(0, fromTop * 100)),
    };
  };

  const commit = () => {
    if (!draft || !plan) return;
    const x = Math.min(draft.x0, draft.x1);
    const y = Math.min(draft.y0, draft.y1);
    const w = Math.abs(draft.x1 - draft.x0);
    const h = Math.abs(draft.y1 - draft.y0);
    setDraft(null);
    if (w < PLAN_ROOM_MIN || h < PLAN_ROOM_MIN) return;
    onPlan({ ...plan, rooms: cleanPlanRooms([...plan.rooms, { room, x, y, w, h }]) });
  };

  return (
    <section className="plan-editor" aria-labelledby="plan-editor-title">
      <h2 id="plan-editor-title">{t('editor.plan.title')}</h2>
      <p className="hint">{t('editor.plan.hint')}</p>

      {!plan ? (
        <label className="picker">
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void onUpload(file);
            }}
          />
          <span>{uploading ? t('editor.uploading') : t('editor.plan.upload')}</span>
        </label>
      ) : (
        <>
          <div className="plan-rooms" role="group" aria-label={t('editor.plan.pick')}>
            {ROOMS.map((option) => (
              <button
                key={option}
                type="button"
                className={option === room ? 'plan-room chosen' : 'plan-room'}
                aria-pressed={option === room}
                onClick={() => setRoom(option)}
              >
                {t(`editor.rooms.${option}`)}
                {plan.rooms.some((drawn) => drawn.room === option) ? ' ✓' : ''}
              </button>
            ))}
          </div>

          <div
            ref={box}
            className="plan-canvas"
            style={{ aspectRatio: `${plan.width} / ${plan.height}` }}
            onPointerDown={(event) => {
              (event.target as Element).setPointerCapture?.(event.pointerId);
              const at = point(event);
              setDraft({ x0: at.x, y0: at.y, x1: at.x, y1: at.y });
            }}
            onPointerMove={(event) => {
              if (!draft) return;
              const at = point(event);
              setDraft({ ...draft, x1: at.x, y1: at.y });
            }}
            onPointerUp={commit}
            onPointerCancel={() => setDraft(null)}
          >
            <img src={plan.url} alt={t('listing.floorPlan')} draggable={false} />
            {plan.rooms.map((drawn) => (
              <span
                key={drawn.room}
                className="plan-rect"
                style={{
                  insetInlineStart: `${drawn.x}%`,
                  insetBlockStart: `${drawn.y}%`,
                  inlineSize: `${drawn.w}%`,
                  blockSize: `${drawn.h}%`,
                }}
              >
                {t(`editor.rooms.${drawn.room}`)}
              </span>
            ))}
            {draft ? (
              <span
                className="plan-rect is-drawing"
                style={{
                  insetInlineStart: `${Math.min(draft.x0, draft.x1)}%`,
                  insetBlockStart: `${Math.min(draft.y0, draft.y1)}%`,
                  inlineSize: `${Math.abs(draft.x1 - draft.x0)}%`,
                  blockSize: `${Math.abs(draft.y1 - draft.y0)}%`,
                }}
              />
            ) : null}
          </div>

          <div className="plan-actions">
            {plan.rooms.length > 0 ? (
              <button
                type="button"
                className="quiet"
                onClick={() => onPlan({ ...plan, rooms: plan.rooms.filter((drawn) => drawn.room !== room) })}
                disabled={!plan.rooms.some((drawn) => drawn.room === room)}
              >
                {t('editor.plan.clearRoom')}
              </button>
            ) : null}
            <button type="button" className="quiet" onClick={() => onPlan(undefined)}>
              {t('editor.plan.remove')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
