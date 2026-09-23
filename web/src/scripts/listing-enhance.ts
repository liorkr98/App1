/**
 * Listing-page enhancement. Vanilla. No framework.
 *
 *   M3  in-view counters on m² only — the HTML already holds the final value.
 *   M4  gallery → lightbox morph via View Transitions, <dialog> fallback.
 *   M5  radio → snap the matching tour card (the track itself is CSS).
 *
 * Budget: ≤ 12 KB gz, enforced by scripts/verify-listing-js-budget.mjs.
 * window.addEventListener('scroll') is banned. IntersectionObserver only.
 */
const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function formatHe(value: number): string {
  return new Intl.NumberFormat('he-IL').format(value);
}

function countUp(el: HTMLElement): void {
  const raw = el.getAttribute('data-count');
  if (raw === null) return;
  const target = Number(raw);
  if (!Number.isFinite(target)) return;
  const finalText = el.textContent?.trim() || formatHe(target);
  if (reduced) {
    el.textContent = finalText;
    return;
  }
  const start = performance.now();
  const duration = 700;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = formatHe(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = finalText;
  };
  requestAnimationFrame(tick);
}

function observeCounts(): void {
  const nodes = document.querySelectorAll<HTMLElement>('[data-count]');
  if (nodes.length === 0) return;
  const io = new IntersectionObserver(
    (entries, obs) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        countUp(entry.target as HTMLElement);
        obs.unobserve(entry.target);
      }
    },
    { threshold: 0.45 },
  );
  for (const node of nodes) io.observe(node);
}

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
}

function bindLightbox(): void {
  const dialog = document.getElementById('listing-lightbox');
  if (!(dialog instanceof HTMLDialogElement)) return;
  const close = dialog.querySelector<HTMLButtonElement>('.lightbox-close');
  const track = dialog.querySelector<HTMLElement>('.lightbox-track');
  let lastFocus: HTMLElement | null = null;
  let pushed = false;

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
    const startTransition = (
      document as Document & {
        startViewTransition?: (update: () => void) => { finished: Promise<unknown> };
      }
    ).startViewTransition;

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
    dialog.close();
    lastFocus?.focus();
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

observeCounts();
bindLightbox();
bindWalk();
