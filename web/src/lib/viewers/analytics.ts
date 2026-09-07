/**
 * Viewer instrumentation (Stage C5).
 *
 * These events answer one question: is the immersive view worth what it costs?
 * It is the most expensive thing on the page in bytes, build time and capture
 * effort, and without `viewer_opened` against `viewer_ready` you cannot tell
 * whether people open it, whether it loads fast enough, or whether they give
 * up waiting.
 *
 * Deliberately provider-free — it pushes to a queue on window that any
 * analytics vendor can drain. The page must not depend on a tracker being
 * present, and CLAUDE.md §8 forbids sending anything that could identify a
 * person to a third party.
 */

export type ViewerEvent =
  | 'viewer_opened'
  | 'viewer_ready'
  | 'viewer_failed'
  | 'scene_changed'
  | 'spin_dragged';

export type EventValue = string | number | boolean | null;

declare global {
  interface Window {
    __listingEvents?: { name: ViewerEvent; props: Record<string, EventValue>; at: number }[];
  }
}

/**
 * Records an event. Never throws — an analytics failure must not take the
 * viewer down with it.
 */
export function track(name: ViewerEvent, props: Record<string, EventValue> = {}): void {
  try {
    window.__listingEvents ??= [];
    window.__listingEvents.push({ name, props, at: Date.now() });

    if (import.meta.env.DEV) {
      console.log('[viewer]', name, props);
    }
  } catch {
    // Storage disabled, or a sandboxed frame. Not worth breaking the page.
  }
}

/** Milliseconds since the tap, for viewer_ready. */
export function since(start: number): number {
  return Math.round(performance.now() - start);
}
