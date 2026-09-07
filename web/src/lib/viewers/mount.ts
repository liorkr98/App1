import type { Immersive } from '@/types/listing';

import { since, track } from './analytics';
import { hasWebGL } from './guards';

/**
 * Client entry for the immersive viewers.
 *
 * Nothing loads until the user taps. A tour is several megabytes and the
 * reader is on Israeli cellular, so auto-loading it would spend their data on
 * something they did not ask for — and the tap is also what makes the
 * viewer_opened / viewer_ready pair meaningful.
 *
 * The heavy libraries live behind dynamic import(), so Photo Sphere Viewer,
 * three.js and the spin renderer are separate chunks that the initial page
 * never fetches.
 */

const READY_TEXT = { tour: 'טוען סיור…', spin: 'טוען תצוגה…' } as const;
const FAILED_TEXT = { tour: 'לא הצלחנו לטעון את הסיור', spin: 'לא הצלחנו לטעון את התצוגה' } as const;

function parsePayload(figure: HTMLElement): Immersive | null {
  const script = figure.querySelector<HTMLScriptElement>('script[type="application/json"]');
  if (!script?.textContent) return null;
  try {
    return JSON.parse(script.textContent) as Immersive;
  } catch {
    return null;
  }
}

function setStatus(figure: HTMLElement, text: string, showRetry: boolean): void {
  const status = figure.querySelector<HTMLElement>('[data-viewer-status]');
  if (!status) return;
  status.textContent = text;
  status.hidden = false;

  const retry = figure.querySelector<HTMLElement>('[data-viewer-retry]');
  if (retry) retry.hidden = !showRetry;
}

function clearStatus(figure: HTMLElement): void {
  const status = figure.querySelector<HTMLElement>('[data-viewer-status]');
  if (status) status.hidden = true;
  const retry = figure.querySelector<HTMLElement>('[data-viewer-retry]');
  if (retry) retry.hidden = true;
}

async function open(figure: HTMLElement): Promise<void> {
  const payload = parsePayload(figure);
  const stage = figure.querySelector<HTMLElement>('[data-viewer-stage]');
  if (!payload || !stage) return;

  const kind = payload.type;
  const started = performance.now();
  track('viewer_opened', { kind });

  // No WebGL: fall back to the gallery SILENTLY. Telling the user their device
  // lacks a graphics feature is information they cannot act on, and the photos
  // below already show the property.
  if (kind === 'tour' && !hasWebGL()) {
    track('viewer_failed', { kind, reason: 'no webgl' });
    figure.hidden = true;
    return;
  }

  // Hide the poster and button, show real progress rather than a spinner: the
  // user just agreed to spend several megabytes and deserves to see it moving.
  figure.querySelector<HTMLElement>('[data-viewer-scrim]')?.setAttribute('hidden', '');
  setStatus(figure, READY_TEXT[kind], false);

  const fail = (message: string) => {
    track('viewer_failed', { kind, ms: since(started) });
    setStatus(figure, message, true);
  };

  try {
    if (payload.type === 'tour') {
      const { mountPanorama } = await import('./panorama');
      const handle = await mountPanorama({
        container: stage,
        scenes: payload.scenes,
        links: payload.links,
        onError: fail,
      });
      if (!handle) return;
    } else {
      const { mountSpin } = await import('./spin');
      const handle = await mountSpin({
        container: stage,
        frameCount: payload.frameCount,
        ...(payload.spriteUrl === undefined ? {} : { spriteUrl: payload.spriteUrl }),
        frames: payload.frames,
        onError: fail,
      });
      if (!handle) return;
    }

    clearStatus(figure);
    stage.hidden = false;
    track('viewer_ready', { kind, ms: since(started) });
  } catch {
    // Never surface the raw error: it is English, untranslated, and can carry
    // a URL into a screenshot.
    fail(FAILED_TEXT[kind]);
  }
}

export function initViewers(): void {
  for (const figure of document.querySelectorAll<HTMLElement>('[data-viewer]')) {
    const button = figure.querySelector<HTMLButtonElement>('[data-viewer-open]');
    const retry = figure.querySelector<HTMLButtonElement>('[data-viewer-retry]');

    button?.addEventListener('click', () => void open(figure));
    retry?.addEventListener('click', () => void open(figure));

    // Escape exits fullscreen. The browser handles this for the Fullscreen
    // API, but the tour also traps arrow keys, so focus must be released.
    figure.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.fullscreenElement) {
        void document.exitFullscreen();
      }
    });
  }
}
