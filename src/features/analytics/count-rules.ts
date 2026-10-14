import { isPreviewScraper } from './scrapers.js';

/**
 * Which requests are a person opening a listing or tapping WhatsApp
 * (13 Oct 2026, the owner: "make sure the dashboard and views are correct").
 *
 * Before this, a view was any render of /a/{slug} that was not a link
 * preview: crawlers, AI fetchers, scripts, browser prefetches, HEAD
 * requests, the agent checking their own page, and every reload counted.
 * Now a request counts only when all of these hold:
 *
 *   - it is a GET;
 *   - it is not a prefetch or prerender (Sec-Purpose / Purpose);
 *   - it does not come from automation (preview scrapers, crawlers, AI
 *     fetchers, headless browsers, HTTP libraries, monitors);
 *   - it is not the agent's own browser (the amud_owner cookie, set while
 *     signed in — it holds "1", not who);
 *   - this browser has not counted for this listing in the last 30 minutes
 *     (the av_/aw_ cookie, which holds "1" and nothing else, CLAUDE.md §9).
 *
 * Nothing about the person is stored, here or in listing_events.
 */
export const COUNT_WINDOW_SECONDS = 30 * 60;
export const OWNER_COOKIE = 'amud_owner';

const AUTOMATED =
  /\bbot\b|bot\/|crawl|spider|slurp|headless|python-|python\/|curl\/|wget|okhttp|go-http|axios|node-fetch|undici|java\/|libwww|httpclient|lighthouse|pagespeed|monitor|uptime|pingdom|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-user|claude-searchbot|perplexity|bytespider|ccbot|amazonbot|meta-externalagent|google-extended|applebot/i;

/** True for a request no person made. A missing user agent is not a bot. */
export function isAutomated(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return isPreviewScraper(userAgent) || AUTOMATED.test(userAgent);
}

export type CountedKind = 'view' | 'wa';

export interface CountRequest {
  method: string;
  userAgent: string | null;
  /** The Sec-Purpose header (Chrome's speculation rules and prefetch). */
  secPurpose: string | null;
  /** The older Purpose / X-Purpose / X-Moz header. */
  purpose: string | null;
  /** The raw Cookie header. */
  cookie: string | null;
  slug: string;
  kind: CountedKind;
}

export interface CountDecision {
  count: boolean;
  /** A Set-Cookie value to send when the request counted. */
  setCookie?: string;
}

/** The per-listing cookie that keeps one person to one count per window. */
export function countCookieName(kind: CountedKind, slug: string): string {
  return `${kind === 'view' ? 'av' : 'aw'}_${slug}`;
}

function hasCookie(header: string | null, name: string): boolean {
  if (!header) return false;
  return header.split(';').some((part) => part.trim().split('=')[0] === name);
}

export function shouldCount(request: CountRequest): CountDecision {
  if (request.method.toUpperCase() !== 'GET') return { count: false };
  const purpose = `${request.secPurpose ?? ''} ${request.purpose ?? ''}`.toLowerCase();
  if (purpose.includes('prefetch') || purpose.includes('prerender')) return { count: false };
  if (isAutomated(request.userAgent)) return { count: false };
  if (hasCookie(request.cookie, OWNER_COOKIE)) return { count: false };
  const name = countCookieName(request.kind, request.slug);
  if (hasCookie(request.cookie, name)) return { count: false };
  return {
    count: true,
    setCookie: `${name}=1; Max-Age=${COUNT_WINDOW_SECONDS}; Path=/a/${request.slug}; SameSite=Lax; Secure; HttpOnly`,
  };
}
