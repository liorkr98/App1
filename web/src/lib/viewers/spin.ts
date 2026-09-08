import { track } from './analytics';

/**
 * The 360° spin.
 *
 * TWO implementations, because the instructions and the library disagree and
 * neither is wrong:
 *
 *   sprite  A single sheet, dragged by moving background-position. Hand-rolled,
 *           zero dependencies. Stage C asks for a sprite sheet because 36
 *           individual requests over Israeli cellular is slow — but
 *           @cloudimage/360-view has no sprite support, its documented config
 *           is folder + filename pattern + amountX.
 *
 *   frames  @cloudimage/360-view, as specified, for the fallback path when no
 *           sprite has been generated.
 *
 * Flagged rather than silently resolved: if you would rather have one code
 * path, the sprite renderer below handles both cases on its own and the
 * dependency can go. That is your call, not mine.
 */

export interface SpinOptions {
  container: HTMLElement;
  frameCount: number;
  /** Preferred. A grid sheet produced by the Stage D pipeline. */
  spriteUrl?: string;
  /** Fallback: individual frame URLs. */
  frames: string[];
  onError: (message: string) => void;
}

export interface SpinHandle {
  destroy: () => void;
}

/** Sheet layout must match the pipeline: 36 frames on a 6x6 grid. */
function gridFor(frameCount: number): { columns: number; rows: number } {
  const columns = Math.ceil(Math.sqrt(frameCount));
  return { columns, rows: Math.ceil(frameCount / columns) };
}

function mountSprite(options: SpinOptions & { spriteUrl: string }): SpinHandle {
  const { container, frameCount, spriteUrl } = options;
  const { columns, rows } = gridFor(frameCount);

  const stage = document.createElement('div');
  stage.className = 'spin-stage';
  stage.setAttribute('role', 'img');
  stage.setAttribute('aria-label', 'תצוגת הרכב מכל הזוויות');
  stage.tabIndex = 0;
  stage.style.backgroundImage = `url("${spriteUrl}")`;
  stage.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
  container.appendChild(stage);

  let frame = 0;
  let dragging = false;
  let lastX = 0;
  let reported = false;

  const show = (index: number) => {
    frame = ((index % frameCount) + frameCount) % frameCount;
    const column = frame % columns;
    const row = Math.floor(frame / columns);
    // Percentage background-position is proportional, not pixel-based, so the
    // sheet stays aligned at any container width without measuring.
    stage.style.backgroundPositionX = columns > 1 ? `${(column / (columns - 1)) * 100}%` : '0%';
    stage.style.backgroundPositionY = rows > 1 ? `${(row / (rows - 1)) * 100}%` : '0%';
  };

  /** One full drag across the container advances one full rotation. */
  const advanceFrom = (x: number) => {
    const delta = x - lastX;
    const perFrame = Math.max(container.clientWidth / frameCount, 1);
    if (Math.abs(delta) < perFrame) return;

    const steps = Math.trunc(delta / perFrame);
    // Dragging left advances forward, matching how the car was walked around.
    show(frame - steps);
    lastX = x;

    if (!reported) {
      track('spin_dragged', { frameCount });
      reported = true;
    }
  };

  const onPointerDown = (event: PointerEvent) => {
    dragging = true;
    lastX = event.clientX;
    stage.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (dragging) advanceFrom(event.clientX);
  };
  const onPointerUp = () => {
    dragging = false;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') show(frame + 1);
    else if (event.key === 'ArrowRight') show(frame - 1);
    else return;
    event.preventDefault();
  };

  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('keydown', onKeyDown);

  show(0);

  return {
    destroy: () => {
      stage.remove();
    },
  };
}

async function mountFrames(options: SpinOptions): Promise<SpinHandle | null> {
  const { container, frameCount, frames, onError } = options;

  const first = frames[0];
  if (!first) {
    onError('לא נמצאו תמונות לתצוגה');
    return null;
  }

  await import('@cloudimage/360-view');

  // The library reads its configuration from data attributes and initialises
  // matching elements itself. filenameX carries an {index} placeholder, so the
  // frames must be named consistently by the pipeline.
  const slash = first.lastIndexOf('/');
  const folder = first.slice(0, slash + 1);
  const filename = first.slice(slash + 1).replace(/\d+(?=\.[a-z]+$)/i, '{index}');

  const stage = document.createElement('div');
  stage.className = 'cloudimage-360';
  stage.dataset.folder = folder;
  stage.dataset.filenameX = filename;
  stage.dataset.amountX = String(frameCount);
  stage.dataset.inertia = 'true';
  stage.dataset.zoomMax = '3';
  stage.dataset.autoplay = 'false';
  stage.dataset.stopAtEdgesX = 'false';
  stage.dataset.dragSpeed = '150';
  container.appendChild(stage);

  stage.addEventListener('pointerdown', () => track('spin_dragged', { frameCount }), {
    once: true,
  });

  return {
    destroy: () => {
      stage.remove();
    },
  };
}

export async function mountSpin(options: SpinOptions): Promise<SpinHandle | null> {
  // Neither path autoplays, so there is nothing for reduce-motion to gate.
  // If autoplay is ever added it must check guards.prefersReducedMotion().
  if (options.spriteUrl) {
    return mountSprite({ ...options, spriteUrl: options.spriteUrl });
  }

  return mountFrames(options);
}
