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
 * The Aurora panel's numbers, one at a time.
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
 * Blueprint's room viewer: a room chip crossfades the viewer to that room.
 *
 * The chips ship hidden, so without this the viewer is simply the first
 * room's photograph and nothing on screen pretends to be interactive.
 */
function bindBlueprint(): void {
  const chips = document.querySelector<HTMLElement>('.bp-rooms');
  const viewer = document.querySelector<HTMLElement>('[data-bp-viewer]');
  if (!chips || !viewer) return;
  const shots = [...viewer.querySelectorAll<HTMLImageElement>('[data-bp-shot]')];
  const label = viewer.querySelector('.bp-label');
  chips.hidden = false;
  chips.addEventListener('click', (event) => {
    const chip = (event.target as Element).closest<HTMLButtonElement>('[data-bp-room]');
    if (!chip) return;
    const at = Number(chip.dataset.bpRoom);
    shots.forEach((shot, index) => {
      if (index === at) shot.loading = 'eager';
      shot.classList.toggle('is-on', index === at);
    });
    chips.querySelectorAll('[data-bp-room]').forEach((other) => {
      other.setAttribute('aria-pressed', String(other === chip));
    });
    if (label) label.textContent = chip.textContent?.trim() ?? '';
  });
}

/**
 * Glass (M10): the cards lean toward the pointer and a light follows it.
 *
 * Pointer only — device-orientation would need an iOS permission prompt on a
 * page someone was simply forwarded. Nothing runs for a reader who asked for
 * less motion or on a touch-only screen; the cards then sit flat, which is
 * their resting state anyway.
 */
function bindGlass(): void {
  const stage = document.querySelector<HTMLElement>('[data-glass]');
  if (!stage) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const cards = [...stage.querySelectorAll<HTMLElement>('[data-tilt]')];
  let frame = 0;
  stage.addEventListener('pointermove', (event) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const box = stage.getBoundingClientRect();
      stage.style.setProperty('--gl-x', `${((event.clientX - box.left) / box.width) * 100}%`);
      stage.style.setProperty('--gl-y', `${((event.clientY - box.top) / box.height) * 100}%`);
      for (const card of cards) {
        const r = card.getBoundingClientRect();
        const dx = (event.clientX - (r.left + r.width / 2)) / r.width;
        const dy = (event.clientY - (r.top + r.height / 2)) / r.height;
        const near = Math.abs(dx) < 1.2 && Math.abs(dy) < 1.2;
        card.style.setProperty('--ry', near ? `${(dx * 5).toFixed(2)}deg` : '0deg');
        card.style.setProperty('--rx', near ? `${(-dy * 5).toFixed(2)}deg` : '0deg');
      }
    });
  });
  stage.addEventListener('pointerleave', () => {
    for (const card of cards) {
      card.style.setProperty('--ry', '0deg');
      card.style.setProperty('--rx', '0deg');
    }
  });
}

/**
 * Heliograph: scrolling the page is one day on the balcony.
 *
 * The server sent a table of sun positions (hour, bearing, altitude) for two
 * days — no coordinates, no astronomy here. Scroll position picks the hour;
 * the sun moves on the plot, the clock and the state line follow, the sky
 * behind the first screen takes the hour's colour, the photographs warm, and
 * below the horizon the page turns to its night palette (heliograph.css).
 * At the top of the page, and for a reader who asked for stillness, it rests
 * at a quarter to one in June — the frame the server already rendered.
 */
function bindHeliograph(): void {
  const stage = document.querySelector<HTMLElement>('[data-helio]');
  if (!stage?.dataset.helio) return;
  type Row = [number, number, number];
  const data = JSON.parse(stage.dataset.helio) as {
    tables: { summer: Row[]; winter: Row[] };
    facing: number;
    strings: Record<'facing' | 'side' | 'behind' | 'twilight' | 'night' | 'below' | 'altitude', string>;
    names: Record<string, number>;
  };
  const sun = stage.querySelector<SVGCircleElement>('[data-sun]');
  const clock = stage.querySelector('[data-clock]');
  const state = stage.querySelector('[data-state]');
  const meta = stage.querySelector('[data-meta]');
  const seasons = stage.querySelector<HTMLElement>('.hl-seasons');
  if (!sun || !clock || !state || !meta || !seasons) return;

  const root = document.documentElement;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let season: 'summer' | 'winter' = 'summer';
  const gap = (a: number, b: number) => Math.abs((((a - b + 540) % 360) + 360) % 360 - 180);
  const compass = (bearing: number) =>
    Object.entries(data.names).reduce((best, [name, deg]) =>
      gap(bearing, deg) < gap(bearing, data.names[best] ?? 0) ? name : best, Object.keys(data.names)[0] ?? '');
  // Night, dawn, gold, day — by the sun's altitude.
  const SKY: [number, [number, number, number]][] = [
    [-18, [14, 18, 36]], [-6, [36, 44, 78]], [-1, [150, 110, 128]], [3, [238, 168, 120]],
    [10, [244, 204, 150]], [25, [240, 236, 222]], [90, [246, 244, 239]],
  ];
  const skyAt = (alt: number) => {
    for (let i = 1; i < SKY.length; i++) {
      const [a0, c0] = SKY[i - 1]!;
      const [a1, c1] = SKY[i]!;
      if (alt <= a1) {
        const k = Math.max(0, Math.min(1, (alt - a0) / (a1 - a0)));
        return c0.map((v, j) => Math.round(v + (c1[j]! - v) * k)).join(',');
      }
    }
    return SKY[SKY.length - 1]![1].join(',');
  };

  const paint = (index: number) => {
    const rows = data.tables[season];
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    if (!row) return;
    const [hour, bearing, alt] = row;
    const r = (88 * (90 - Math.max(-8, alt))) / 90;
    const rad = (bearing * Math.PI) / 180;
    sun.setAttribute('cx', (100 + r * Math.sin(rad)).toFixed(1));
    sun.setAttribute('cy', (100 - r * Math.cos(rad)).toFixed(1));
    sun.classList.toggle('is-below', alt < 0);
    clock.textContent = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
    state.textContent =
      alt < -6
        ? data.strings.night
        : alt < 0
          ? data.strings.twilight
          : gap(bearing, data.facing) < 60
            ? data.strings.facing
            : gap(bearing, data.facing) < 90
              ? data.strings.side
              : data.strings.behind;
    meta.textContent = '';
    if (alt < 0) meta.textContent = data.strings.below;
    else {
      const deg = document.createElement('bdi');
      deg.textContent = `${Math.round(alt)}°`;
      meta.append(`${data.strings.altitude} `, deg, ` · ${compass(bearing)}`);
    }
    stage.style.setProperty('--hl-sky', `rgb(${skyAt(alt)})`);
    const warm = alt > 0 ? Math.max(0, 1 - alt / 30) : 0;
    root.style.setProperty(
      '--hl-grade',
      alt < -4
        ? 'brightness(.6) saturate(.7) hue-rotate(185deg) sepia(.2)'
        : `sepia(${(warm * 0.45).toFixed(2)}) saturate(${(1 + warm * 0.3).toFixed(2)})`,
    );
    root.classList.toggle('hl-night', alt < -4);
  };

  const restIndex = () => Math.round((12.75 - (data.tables[season][0]?.[0] ?? 4.5)) / 0.25);
  let frame = 0;
  const onScroll = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (still || scrollY < 4 || max <= 0) return paint(restIndex());
      paint(Math.round((scrollY / max) * (data.tables[season].length - 1)));
    });
  };

  seasons.hidden = false;
  seasons.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-season]');
    if (!button) return;
    season = button.dataset.season === 'winter' ? 'winter' : 'summer';
    seasons.querySelectorAll('[data-season]').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    stage.querySelectorAll('[data-arc]').forEach((arc) =>
      arc.classList.toggle('hl-arc-off', (arc as HTMLElement).dataset.arc !== season));
    onScroll();
  });
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
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
bindBlueprint();
bindGlass();
bindHeliograph();
beaconReadToAgent();
