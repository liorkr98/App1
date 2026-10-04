#!/usr/bin/env node
/**
 * Serves a built site directory over HTTP, for the browser checks.
 *
 * Why not `astro preview`: it runs the Cloudflare runtime, which 404s the
 * prerendered /template-check pages the checks measure. Why not a package:
 * a static file server is forty lines of node:http, and every dependency is a
 * conversation (CLAUDE.md §2). Why not python: macOS does not promise one.
 *
 * Local only, read-only, no directory listing, and nothing outside the root:
 * the resolved path must stay inside it.
 *
 * Run: node scripts/serve-static.mjs <dir> [port]
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? 'web/dist/client');
const port = Number(process.argv[3] ?? 8099);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const full = path.resolve(root, `.${clean}`);
  if (full !== root && !full.startsWith(root + path.sep)) return undefined;
  if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
    const index = path.join(full, 'index.html');
    return fs.existsSync(index) ? index : undefined;
  }
  return fs.existsSync(full) ? full : undefined;
}

http
  .createServer((request, response) => {
    const file = resolve(request.url ?? '/');
    if (!file) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`serving ${root} on http://127.0.0.1:${port}`);
  });
