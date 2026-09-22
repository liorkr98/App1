#!/usr/bin/env node
/**
 * Fails if the listing page's executable JS exceeds 12 KB gzipped.
 *
 * Redesign plan §3.1 / DESIGN-CONTRACT.md §6.4. JSON-LD is not executable
 * and is ignored. Template-check HTML is the listing document the CI can
 * see (the real /a/{slug} route is SSR).
 *
 * Run after the web build: node scripts/verify-listing-js-budget.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = process.argv[2] ?? 'web/dist';
const LIMIT = 12 * 1024;

function findPage(...parts) {
  const candidates = [
    path.join(DIST, ...parts, 'index.html'),
    path.join(DIST, 'client', ...parts, 'index.html'),
  ];
  return candidates.find((file) => fs.existsSync(file));
}

const htmlPath = findPage('template-check', 'A7K2M');
if (!htmlPath) {
  console.error('listing JS budget: no built template-check/A7K2M HTML');
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const dir = path.dirname(htmlPath);
const srcs = new Set();

for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
  const attrs = match[1] ?? '';
  if (/\btype\s*=\s*["']application\/ld\+json["']/i.test(attrs)) continue;
  const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
  if (src) srcs.add(src[1]);
}

let total = 0;
const rows = [];

for (const src of srcs) {
  const file = src.startsWith('/')
    ? path.join(path.dirname(htmlPath).includes(`${path.sep}client`) ? path.join(DIST, 'client') : DIST, src.replace(/^\//, ''))
    : path.join(dir, src);
  if (!fs.existsSync(file)) {
    console.error(`listing JS budget: missing ${src} (resolved ${file})`);
    process.exit(1);
  }
  const gz = gzipSync(fs.readFileSync(file)).byteLength;
  total += gz;
  rows.push({ src, gz });
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
