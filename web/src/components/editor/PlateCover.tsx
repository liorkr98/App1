import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { moveRect, PLATE_START, resizeRect, type PlateRect } from '@/features/listings/plate-rect';

import { t } from '../../lib/i18n';
import type { PlateMode } from '../../lib/plate-cover';

interface Props {
  /** The photograph, as it is on the listing now. */
  src: string;
  /** The agency logo from the profile; without one, only the blur is offered. */
  logoUrl: string | undefined;
  busy: boolean;
  onApply: (rect: PlateRect, mode: PlateMode) => void;
  onClose: () => void;
}

/**
 * Where the plate is (19 Oct 2026). The photo check knows a plate is in the
 * picture but not where, so the agent drags a box over it — or nudges it with
 * the arrow keys — and chooses a blur or their logo. Nothing changes until
 * they choose; the editor then replaces the photograph (plate-cover.ts).
 *
 * The stage is laid out left-to-right on purpose: the box's position is a
 * place in the photograph, which has no reading direction.
 */
export function PlateCover({ src, logoUrl, busy, onApply, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<PlateRect>(PLATE_START);
  const drag = useRef<{ kind: 'move' | 'size'; x: number; y: number; from: PlateRect } | undefined>(undefined);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const start = (kind: 'move' | 'size') => (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind, x: event.clientX, y: event.clientY, from: rect };
  };
  const follow = (event: ReactPointerEvent<HTMLElement>) => {
    const box = stage.current?.getBoundingClientRect();
    const held = drag.current;
    if (!box || !held || box.width === 0 || box.height === 0) return;
    const dx = (event.clientX - held.x) / box.width;
    const dy = (event.clientY - held.y) / box.height;
    setRect(held.kind === 'move' ? moveRect(held.from, dx, dy) : resizeRect(held.from, dx, dy));
  };
  const stop = () => {
    drag.current = undefined;
  };
  const nudge = (event: React.KeyboardEvent<HTMLElement>) => {
    const step = 0.02;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setRect((current) => (event.shiftKey ? resizeRect(current, move[0], move[1]) : moveRect(current, move[0], move[1])));
  };

  return (
    <dialog ref={dialog} className="plate-dialog" onClose={onClose} aria-labelledby="plate-title">
      <h2 id="plate-title" className="field-label">
        {t('editor.plate.title')}
      </h2>
      <p className="field-hint">{t('editor.plate.hint')}</p>
      <div className="plate-stage" dir="ltr" ref={stage}>
        <img src={src} alt="" crossOrigin="anonymous" draggable={false} />
        <div
          className="plate-box"
          role="slider"
          tabIndex={0}
          aria-label={t('editor.plate.box')}
          aria-valuetext={t('editor.plate.box')}
          style={{
            insetInlineStart: `${rect.x * 100}%`,
            insetBlockStart: `${rect.y * 100}%`,
            inlineSize: `${rect.w * 100}%`,
            blockSize: `${rect.h * 100}%`,
          }}
          onPointerDown={start('move')}
          onPointerMove={follow}
          onPointerUp={stop}
          onPointerCancel={stop}
          onKeyDown={nudge}
        >
          <span
            className="plate-handle"
            aria-hidden="true"
            onPointerDown={start('size')}
            onPointerMove={follow}
            onPointerUp={stop}
            onPointerCancel={stop}
          />
        </div>
      </div>
      <div className="plate-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => onApply(rect, 'blur')}>
          {t('editor.plate.blur')}
        </button>
        {logoUrl ? (
          <button type="button" className="secondary" disabled={busy} onClick={() => onApply(rect, 'logo')}>
            {t('editor.plate.logo')}
          </button>
        ) : null}
        <button type="button" className="quiet" disabled={busy} onClick={() => dialog.current?.close()}>
          {t('editor.plate.cancel')}
        </button>
      </div>
      {busy ? <p className="field-hint" role="status">{t('editor.plate.working')}</p> : null}
    </dialog>
  );
}
