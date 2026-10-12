import { defineMiddleware } from 'astro:middleware';

import SECURITY_HEADERS from './lib/security-headers.json';

/**
 * The same security headers on what the Worker renders (/a/{slug}, /api/*)
 * as `_headers` puts on every static file (integrations/security-headers.mjs).
 * One list, src/lib/security-headers.json, read by both.
 *
 * A header the route already set wins: a page that needs a different rule
 * says so itself, and this does not overwrite it.
 */
export const onRequest = defineMiddleware(async (_context, next) => {
  const response = await next();
  try {
    addTo(response.headers);
    return response;
  } catch {
    // An immutable response (a fetch passed straight through): copy it.
    const copy = new Response(response.body, response);
    addTo(copy.headers);
    return copy;
  }
});

function addTo(headers: Headers): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
}
