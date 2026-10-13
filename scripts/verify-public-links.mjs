#!/usr/bin/env node
/**
 * Every link on a deployed page leads to something that is deployed
 * (13 Oct 2026).
 *
 * WHY. The homepage linked its sixteen template examples into
 * /template-check/, which web/public/.assetsignore keeps out of the upload.
 * Locally and in CI the files were on disk, so every check passed; on the
 * live site every example answered "page not found". Nothing looked at the
 * build the way the deploy sees it.
 *
 * For every built page that is itself uploaded, each same-site link must:
 *   1. not point into a path .assetsignore excludes, and
 *   2. resolve to a built file, or to a route the Worker renders (/a/,
 *      /api/, /preview, /sitemap.xml).
 *
 * Run after the web build:
 *   node scripts/verify-public-links.mjs [distClientDir]
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2] ?? 'web/dist/client';
/** Rendered per request by the Worker, so never a file in the build. */
const SERVER_ROUTES = [/^\/a\/[^/]+\//, /^\/api\//, /^\/preview\/?$/, /^\/sitemap\.xml$/];

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error(`No build at ${DIST}. Run the web build first.`);
  process.exit(1);
}

const ignoreFile = path.join(DIST, '.assetsignore');
const ignored = fs.existsSync(ignoreFile)
  ? fs
      .readFileSync(ignoreFile, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
  : [];
/** A path relative to the build root, as wrangler matches it. */
const isIgnored = (rel) =>
  ignored.some((pattern) =>
    pattern.endsWith('/') ? rel === pattern.slice(0, -1) || rel.startsWith(pattern) : rel === pattern,
  );

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(path.relative(DIST, full).split(path.sep).join('/'));
  }
};
walk(DIST);
const deployed = new Set(files.filter((rel) => !isIgnored(rel)));

/** What a URL path is served from, or undefined. */
const resolves = (urlPath) => {
  const rel = decodeURIComponent(urlPath).replace(/^\//, '');
  if (rel === '' || rel.endsWith('/')) return deployed.has(`${rel}index.html`);
  return deployed.has(rel) || deployed.has(`${rel}.html`) || deployed.has(`${rel}/index.html`);
};

const problems = [];
let checked = 0;
for (const page of [...deployed].filter((rel) => rel.endsWith('.html')).sort()) {
  const html = fs.readFileSync(path.join(DIST, page), 'utf8');
  for (const match of html.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) {
    const href = match[1].replace(/&amp;/g, '&');
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const urlPath = href.split(/[?#]/)[0];
    checked += 1;
    const rel = urlPath.replace(/^\//, '');
    if (isIgnored(rel) || isIgnored(`${rel.replace(/\/$/, '')}/`)) {
      problems.push(`${page}: links to ${href}, which .assetsignore keeps out of the deploy.`);
    } else if (!SERVER_ROUTES.some((route) => route.test(urlPath)) && !resolves(urlPath)) {
      problems.push(`${page}: links to ${href}, which is not in the build.`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} link(s) on deployed pages lead nowhere on the live site.`);
  process.exit(1);
}
console.log(`OK: ${checked} same-site links on ${[...deployed].filter((r) => r.endsWith('.html')).length} deployed pages all resolve.`);
