/**
 * Analytics façade.
 *
 * One `track()` interface so the underlying provider can be swapped per app
 * without touching call sites. The default provider is a no-op: an app that
 * has not chosen a vendor sends nothing, rather than silently sending to
 * whatever was last configured.
 *
 * CLAUDE.md §8: health, financial and children's data must never reach a
 * third-party analytics provider. `track` takes a narrow property type on
 * purpose — passing an arbitrary object makes it far too easy to spread a
 * whole user record into an event.
 */

export type AnalyticsValue = string | number | boolean | null;
export type AnalyticsProps = Record<string, AnalyticsValue>;

export interface AnalyticsProvider {
  track(event: string, props?: AnalyticsProps): void;
  /** Associates subsequent events with a user id. Never pass an email. */
  identify(userId: string, traits?: AnalyticsProps): void;
  screen(name: string, props?: AnalyticsProps): void;
  /** Called on sign-out. Must clear any stored identity. */
  reset(): void;
}

/**
 * Default provider. Deliberately does nothing.
 *
 * In development it logs, so you can see the event stream without wiring a
 * vendor. In production it is silent.
 */
export const noopAnalyticsProvider: AnalyticsProvider = {
  track(event, props) {
    if (__DEV__) {
      console.log('[analytics] track', event, props ?? {});
    }
  },
  identify(userId) {
    if (__DEV__) {
      console.log('[analytics] identify', userId);
    }
  },
  screen(name, props) {
    if (__DEV__) {
      console.log('[analytics] screen', name, props ?? {});
    }
  },
  reset() {
    if (__DEV__) {
      console.log('[analytics] reset');
    }
  },
};

let provider: AnalyticsProvider = noopAnalyticsProvider;

/** Swap the provider at app start, before any event is sent. */
export function setAnalyticsProvider(next: AnalyticsProvider): void {
  provider = next;
}

export function track(event: string, props?: AnalyticsProps): void {
  provider.track(event, props);
}

export function identify(userId: string, traits?: AnalyticsProps): void {
  provider.identify(userId, traits);
}

export function screen(name: string, props?: AnalyticsProps): void {
  provider.screen(name, props);
}

export function resetAnalytics(): void {
  provider.reset();
}
