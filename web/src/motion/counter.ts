/**
 * M8 · numbers count up to the value already in the markup.
 *
 * The final text is written server-side, so a page with no JavaScript, a
 * reduced-motion reader and a screenshot all read the real number. The
 * script only animates towards it, then restores the original string
 * exactly (separators, units and all), so the count can never leave a
 * different number behind.
 *
 * What counts is decided where [data-count] is written, not here: area and
 * mileage, never the price and never a floor ratio.
 */

const reduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function format(value: number): string {
  return new Intl.NumberFormat('he-IL').format(value);
}

export function countUp(el: HTMLElement, duration = 1100): void {
  const target = Number(el.getAttribute('data-count'));
  if (!Number.isFinite(target)) return;
  const finalText = el.textContent?.trim() || format(target);
  if (reduced) {
    el.textContent = finalText;
    return;
  }
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 4;
    el.textContent = t < 1 ? format(Math.round(target * eased)) : finalText;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Counts each [data-count] once, when it is 45% in view. */
export function observeCounts(root: ParentNode = document): () => void {
  const nodes = root.querySelectorAll<HTMLElement>('[data-count]');
  if (nodes.length === 0 || typeof IntersectionObserver !== 'function') return () => {};
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
  return () => io.disconnect();
}
