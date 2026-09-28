/**
 * The kinds of listing event, and who may report each.
 *
 *   view       a buyer opened the page          — the SSR route, server-side
 *   wa         a buyer tapped WhatsApp          — /a/{slug}/wa, server-side
 *   share      the agent opened the share page  — /a/{slug}/share, server-side
 *   scroll_75  a buyer read down to the agent   — a beacon from the page
 *
 * Only scroll_75 may come from the browser. Letting a client report views or
 * taps would let anyone inflate an agent's numbers with a loop; the three
 * server-side kinds are recorded where the thing actually happens.
 *
 * No kind carries a user agent or an IP (CLAUDE.md §9). The table only ever
 * learns "this listing, this kind, now".
 */
export const EVENT_KINDS = ['view', 'wa', 'share', 'scroll_75'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const BEACON_KINDS = ['scroll_75'] as const satisfies readonly EventKind[];
export type BeaconKind = (typeof BEACON_KINDS)[number];

export function isEventKind(value: unknown): value is EventKind {
  return typeof value === 'string' && (EVENT_KINDS as readonly string[]).includes(value);
}

export function isBeaconKind(value: unknown): value is BeaconKind {
  return typeof value === 'string' && (BEACON_KINDS as readonly string[]).includes(value);
}
