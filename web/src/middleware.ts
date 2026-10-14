import { defineMiddleware } from 'astro:middleware';

import { pathLang, withLang } from './lib/locale-server';
import SECURITY_HEADERS from './lib/security-headers.json';

/**
 * The same security headers on what the Worker renders (/a/{slug}, /api/*)
 * as `_headers` puts on every static file (integrations/security-headers.mjs).
 * One list, src/lib/security-headers.json, read by both.
 *
 * A header the route already set wins: a page that needs a different rule
 * says so itself, and this does not overwrite it.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  // A listing page in English, Russian or Arabic (lib/locale-server.ts): the
  // whole render, body included, inside that language. The body is read here
  // because a streamed one would finish rendering outside it.
  const language = pathLang(context.url.pathname);
  const response = language
    ? await withLang(language, async () => {
        const rendered = await next();
        const body = await rendered.text();
        return new Response(body, rendered);
      })
    : await next();
  const extra = neverIndexed(context.url.pathname) ? NOINDEX : {};
  try {
    addTo(response.headers, extra);
    return response;
  } catch {
    // An immutable response (a fetch passed straight through): copy it.
    const copy = new Response(response.body, response);
    addTo(copy.headers, extra);
    return copy;
  }
});

const NOINDEX = { 'X-Robots-Tag': 'noindex, nofollow, noarchive' };

/**
 * What the Worker renders that is never a search result: the API, and a
 * listing's share, story, flyer and card pages. The listing page itself, in
 * any language, decides for itself from the seller's choice.
 */
function neverIndexed(path: string): boolean {
  if (pathLang(path)) return false;
  return path.startsWith('/api/') || /^\/a\/[^/]+\/[^/]+/.test(path);
}

function addTo(headers: Headers, extra: Record<string, string>): void {
  for (const [name, value] of Object.entries({ ...SECURITY_HEADERS, ...extra })) {
    if (!headers.has(name)) headers.set(name, value);
  }
}
