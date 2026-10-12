import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The security headers on every static file (12 Oct 2026, with amudsell.com).
 *
 * Cloudflare serves the homepage, the editor and every other prerendered
 * page straight from the asset store, before the Worker runs, so the only
 * way to give those responses headers is the `_headers` file. The Worker's
 * own responses (/a/{slug}, /api/*) get the same set from src/middleware.ts.
 * Both read src/lib/security-headers.json, so the two cannot drift, and
 * scripts/verify-security-headers.mjs checks the built file against it.
 *
 * What the set is, and why it is this small:
 *   - HSTS: a browser that has seen the site once never tries plain http
 *     again. No `preload` — that is a submission to the browsers' list and
 *     hard to undo, so it is the owner's call (docs/DEPLOY.md).
 *   - nosniff, SAMEORIGIN, a referrer that never leaks a full listing URL to
 *     another site, no camera/mic/location for anyone.
 *   - A CSP that only fences what cannot break a page: who may frame us,
 *     <base>, plugins, where forms post, and http sub-resources upgraded.
 *     A script-src policy needs every inline script hashed first; it is not
 *     here rather than here and wrong.
 */
const HEADERS = JSON.parse(
  fs.readFileSync(new URL('../src/lib/security-headers.json', import.meta.url), 'utf8'),
);

export default function securityHeaders() {
  return {
    name: 'security-headers',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const file = path.join(fileURLToPath(dir), '_headers');
        const block = `/*\n${Object.entries(HEADERS)
          .map(([name, value]) => `  ${name}: ${value}`)
          .join('\n')}\n`;
        const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        fs.writeFileSync(file, `${block}\n${existing}`);
      },
    },
  };
}
