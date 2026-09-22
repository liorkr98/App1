#!/usr/bin/env node
/**
 * Fails if the listing page's executable JS exceeds 12 KB gzipped.
 *
 * Redesign plan §3.1 / DESIGN-CONTRACT.md §6.4. JSON-LD is not executable
 * and is ignored. Template-check HTML is the listing document the CI can
 * see (the real /a/{slug} route is SSR).
 *
 * Counts every file the entry script imports, because Astro splits the
 * listing enhance module into a chunk the HTML does not mention.
 *
 * Run after the web build: node scripts/verify-listing-js-budget.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = process.argv[2] ?? 'web/dist';
const LIMIT = 12 * 1024;
const IMPORT = /(?:import|export)\s*(?:[^'"\n]+from\s*)?["'](\.[^"']+)["']/g;

function findPage(...parts) {
  const candidates = [
    path.join(DIST, ...parts, 'index.html'),
    path.join(DIST, 'client', ...parts, 'index.html'),
  ];
  return candidates.find((file) => fs.existsSync(file));
}

function clientRoot(htmlPath) {
  return path.dirname(htmlPath).includes(`${path.sep}client`)
    ? path.join(DIST, 'client')
    : DIST;
}

function resolveSrc(src, htmlPath, fromFile) {
  if (src.startsWith('/')) return path.join(clientRoot(htmlPath), src.replace(/^\//, ''));
  return path.join(path.dirname(fromFile ?? htmlPath), src);
}

const htmlPath = findPage('template-check', 'A7K2M');
if (!htmlPath) {
  console.error('listing JS budget: no built template-check/A7K2M HTML');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const pending = [];

for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
  const attrs = match[1] ?? '';
  if (/\btype\s*=\s*["']application\/ld\+json["']/i.test(attrs)) continue;
  const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
  if (src) pending.push(resolveSrc(src[1], htmlPath));
}

const seen = new Set();
const rows = [];
let total = 0;

while (pending.length > 0) {
  const file = pending.pop();
  if (!file || seen.has(file)) continue;
  seen.add(file);
  if (!fs.existsSync(file)) {
    console.error(`listing JS budget: missing ${file}`);
    process.exit(1);
  }
  const source = fs.readFileSync(file);
  const gz = gzipSync(source).byteLength;
  total += gz;
  rows.push({ src: path.relative(clientRoot(htmlPath), file), gz });

  IMPORT.lastIndex = 0;
  const text = source.toString('utf8');
  let match;
  while ((match = IMPORT.exec(text))) {
    pending.push(path.normalize(path.join(path.dirname(file), match[1])));
  }
}

const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter((match) => {
  const attrs = match[1] ?? '';
  if (/\btype\s*=\s*["']application\/ld\+json["']/i.test(attrs)) return false;
  if (/\bsrc\s*=/i.test(attrs)) return false;
  return (match[2] ?? '').trim().length > 0;
});

for (const match of inline) {
  const gz = gzipSync(Buffer.from(match[2] ?? '')).byteLength;
  total += gz;
  rows.push({ src: '(inline)', gz });
}

console.log(`listing JS budget: ${total} bytes gz (limit ${LIMIT})`);
for (const row of rows) console.log(`  ${row.gz}  ${row.src}`);

if (total > LIMIT) {
  console.error(`listing JS exceeds ${LIMIT} bytes gz`);
  process.exit(1);
}
