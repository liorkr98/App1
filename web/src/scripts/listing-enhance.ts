/**
 * Listing-page enhancement. Vanilla. No framework.
 *
 * Two jobs, and only these two (redesign plan §3.1, DESIGN-CONTRACT §6.4):
 *   M3  in-view counters on m² and rooms — the HTML already holds the final
 *       value, so no-JS, SEO and screen readers stay correct.
 *   M4  gallery → lightbox morph via same-document View Transitions, with
 *       a <dialog> fallback (focus trap + Escape for free).
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
  for (const button of buttons) {
    const src = button.getAttribute('data-lightbox');
    const alt = button.getAttribute('data-alt') ?? '';
    if (!src) continue;
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
}

function bindLightbox(): void {
  const dialog = document.getElementById('listing-lightbox');
  if (!(dialog instanceof HTMLDialogElement)) return;
  const close = dialog.querySelector<HTMLButtonElement>('.lightbox-close');
  let lastFocus: HTMLElement | null = null;

  const open = (button: HTMLButtonElement) => {
    const src = button.getAttribute('data-lightbox');
    if (!src) return;
    lastFocus = button;
    fillTrack(dialog, src);
    const run = () => dialog.showModal();
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

  const hide = () => {
    if (!dialog.open) return;
    dialog.close();
    lastFocus?.focus();
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

  close?.addEventListener('click', hide);
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    hide();
  });
}

observeCounts();
bindLightbox();
