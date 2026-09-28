import { observeCounts } from '../motion/counter';

/**
 * Listing-page enhancement. Vanilla. No framework.
 *
 *   M3  in-view counters on m² only — the HTML already holds the final value.
 *       Shared with every Living Surfaces page: web/src/motion/counter.ts.
 *   M4  gallery → lightbox morph via View Transitions, <dialog> fallback.
 *   M5  radio → snap the matching tour card (the track itself is CSS).
 *
 * Budget: ≤ 12 KB gz, enforced by scripts/verify-listing-js-budget.mjs.
 * window.addEventListener('scroll') is banned. IntersectionObserver only.
 */
const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function allGalleryButtons(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[data-lightbox]'));
}

function fillTrack(dialog: HTMLDialogElement, startSrc: string): void {
  const track = dialog.querySelector<HTMLElement>('.lightbox-track');
  if (!track) return;
  track.replaceChildren();
  const buttons = allGalleryButtons();
  const seen = new Set<string>();
  for (const button of buttons) {
    const src = button.getAttribute('data-lightbox');
    const alt = button.getAttribute('data-alt') ?? '';
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const figure = document.createElement('figure');
    figure.className = 'lightbox-slide';
    const room = button.getAttribute('data-room');
    if (room) figure.dataset.room = room;
    const img = document.createElement('img');
    img.src = src;
    img.alt = alt;
    img.decoding = 'async';
    figure.append(img);
    track.append(figure);
    if (src === startSrc) {
      queueMicrotask(() => figure.scrollIntoView({ inline: 'center', block: 'nearest' }));
    }
  }
  updateLightboxCount(dialog, track);
}

function updateLightboxCount(dialog: HTMLDialogElement, track: HTMLElement): void {
  const label = dialog.querySelector<HTMLElement>('[data-lightbox-count]');
  const slides = [...track.querySelectorAll<HTMLElement>('.lightbox-slide')];
  if (!label || slides.length === 0) return;
  const mid = track.getBoundingClientRect().left + track.clientWidth / 2;
  let index = 0;
  for (const [i, slide] of slides.entries()) {
    const box = slide.getBoundingClientRect();
    if (box.left <= mid && box.right >= mid) {
      index = i;
      break;
    }
  }
  label.textContent = `${index + 1} / ${slides.length}`;
  const room = dialog.querySelector<HTMLElement>('[data-lightbox-room]');
  const name = slides[index]?.dataset.room ?? '';
  if (room) {
    room.textContent = name;
    room.hidden = name === '';
  }
}

function activeSlide(track: HTMLElement): number {
  const slides = [...track.querySelectorAll<HTMLElement>('.lightbox-slide')];
  const mid = track.getBoundingClientRect().left + track.clientWidth / 2;
  for (const [i, slide] of slides.entries()) {
    const box = slide.getBoundingClientRect();
    if (box.left <= mid && box.right >= mid) return i;
  }
  return 0;
}

function bindLightbox(): void {
  const dialog = document.getElementById('listing-lightbox');
  if (!(dialog instanceof HTMLDialogElement)) return;
  const close = dialog.querySelector<HTMLButtonElement>('.lightbox-close');
  const track = dialog.querySelector<HTMLElement>('.lightbox-track');
  let lastFocus: HTMLElement | null = null;
  let pushed = false;
  const startTransition = (
    document as Document & {
      startViewTransition?: (update: () => void) => { finished: Promise<unknown> };
    }
  ).startViewTransition;

  const open = (button: HTMLButtonElement) => {
    const src = button.getAttribute('data-lightbox');
    if (!src) return;
    lastFocus = button;
    fillTrack(dialog, src);
    const run = () => {
      dialog.showModal();
      if (!pushed) {
        history.pushState({ listingLightbox: true }, '');
        pushed = true;
      }
    };
    if (startTransition && !reduced) {
      button.style.viewTransitionName = 'listing-photo';
      startTransition(run).finished.finally(() => {
        button.style.viewTransitionName = '';
      });
    } else {
      run();
    }
  };

  const hide = (fromPop = false) => {
    if (!dialog.open) return;
    const finish = () => {
      dialog.close();
      lastFocus?.focus();
      if (pushed && !fromPop) {
        pushed = false;
        history.back();
        return;
      }
      pushed = false;
    };
    const source = lastFocus;
    if (startTransition && !reduced && source) {
      source.style.viewTransitionName = 'listing-photo';
      startTransition(finish).finished.finally(() => {
        source.style.viewTransitionName = '';
      });
    } else {
      finish();
    }
  };

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('[data-lightbox]');
    if (button) {
      event.preventDefault();
      open(button);
    }
  });

  close?.addEventListener('click', () => hide());
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    hide();
  });
  track?.addEventListener('scroll', () => {
    if (track) updateLightboxCount(dialog, track);
  }, { passive: true });
  window.addEventListener('popstate', () => {
    if (dialog.open) hide(true);
  });
  dialog.addEventListener('keydown', (event) => {
    if (!dialog.open || !track) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const slides = [...track.querySelectorAll<HTMLElement>('.lightbox-slide')];
    if (slides.length === 0) return;
    const current = activeSlide(track);
    // ArrowLeft is forward on an RTL page: the next photo sits to the left.
    const next = event.key === 'ArrowLeft' ? current + 1 : current - 1;
    const slide = slides[(next + slides.length) % slides.length];
    slide?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: reduced ? 'instant' : 'smooth',
    });
  });
}

function bindWalk(): void {
  const viewer = document.querySelector('.walk-viewer');
  const track = document.querySelector('.walk-main.tour-track');
  if (!viewer || !track) return;
  viewer.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.classList.contains('walk-pick')) return;
    const picks = [...viewer.querySelectorAll('.walk-pick')];
    const card = track.querySelectorAll(':scope > figure')[picks.indexOf(input)];
    card?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: reduced ? 'instant' : 'smooth',
    });
  });
}

function bindMapDialog(): void {
  const dialog = document.getElementById('listing-map');
  if (!(dialog instanceof HTMLDialogElement)) return;
  let pushed = false;

  const hide = (fromPop = false) => {
    if (!dialog.open) return;
    dialog.close();
    if (pushed && !fromPop) {
      pushed = false;
      history.back();
      return;
    }
    pushed = false;
  };

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-map-open]')) {
      event.preventDefault();
      dialog.showModal();
      if (!pushed) {
        history.pushState({ listingMap: true }, '');
        pushed = true;
      }
    }
    if (target.closest('[data-map-close]')) hide();
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    hide();
  });
  window.addEventListener('popstate', () => {
    if (dialog.open) hide(true);
  });
}

/**
 * The cinema panel's numbers, one at a time.
 *
 * Without this every number shows in a row, which is the whole content; the
 * script only adds the stepping. RTL: the start-side button goes back.
 */
function bindMetric(): void {
  const panel = document.querySelector<HTMLElement>('[data-metric]');
  const items = panel ? [...panel.querySelectorAll<HTMLElement>('.cine-metric')] : [];
  if (!panel || items.length < 2) return;
  let at = 0;
  panel.classList.add('is-cycling');
  panel.addEventListener('click', (event) => {
    const step = (event.target as Element).closest('[data-metric-step]');
    if (!step) return;
    items[at]?.classList.remove('is-on');
    at = (at + Number(step.getAttribute('data-metric-step')) + items.length) % items.length;
    items[at]?.classList.add('is-on');
  });
}

/**
 * scroll_75 · the buyer read down to the agent.
 *
 * One beacon per page view, the first time the seller block is half in view.
 * sendBeacon so it never delays anything and survives the tab closing. The
 * route accepts no other kind from a browser (src/features/analytics/events.ts),
 * and the table stores no user agent or IP.
 */
function beaconReadToAgent(): void {
  const slug = document.documentElement.dataset.slug;
  const target = document.querySelector('.seller');
  if (!slug || !target || typeof navigator.sendBeacon !== 'function') return;
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      io.disconnect();
      navigator.sendBeacon(`/a/${slug}/e`, 'scroll_75');
    },
    { threshold: 0.5 },
  );
  io.observe(target);
}

observeCounts();
bindLightbox();
bindWalk();
bindMapDialog();
bindMetric();
beaconReadToAgent();
