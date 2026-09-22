#!/usr/bin/env node
/**
 * WhatsApp card contract on the built listing HTML.
 *
 * CLAUDE.md §6: og:title is "<summary> · <price>", og:locale he_IL, og:image
 * is an absolute URL with the content hash in the FILENAME. לפי פנייה must
 * not leak the hidden figure onto the card (P8 left ₪41,000 on polo).
 *
 * Run after the web build: node scripts/verify-og-title.mjs [dist-dir]
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2] ?? 'web/dist/client';

function page(slug) {
  const candidates = [
    path.join(DIST, 'template-check', slug, 'index.html'),
    path.join(DIST, 'client', 'template-check', slug, 'index.html'),
  ];
  return candidates.find((file) => fs.existsSync(file));
}

function meta(html, property) {
  const match = html.match(new RegExp(`<meta property="${property}" content="([^"]*)"`));
  return match?.[1];
}

const problems = [];

function requirePage(slug) {
  const file = page(slug);
  if (!file) {
    problems.push(`missing template-check/${slug}/index.html`);
    return null;
  }
  return fs.readFileSync(file, 'utf8');
}

const polo = requirePage('P5X1R');
if (polo) {
  const title = meta(polo, 'og:title') ?? '';
  if (/41/.test(title) || /₪/.test(title)) {
    problems.push(`P5X1R og:title still carries a figure: ${title}`);
  }
  if (!title.includes('פולו')) {
    problems.push(`P5X1R og:title lost the car: ${title}`);
  }
}

const golf = requirePage('G7F2K');
if (golf) {
  const title = meta(golf, 'og:title') ?? '';
  if (!title.includes('החל מ־') || !title.includes('62,000')) {
    problems.push(`G7F2K og:title should be החל מ־ ₪62,000: ${title}`);
  }
}

const tlv = requirePage('T4V7A');
if (tlv) {
  const title = meta(tlv, 'og:title') ?? '';
  const image = meta(tlv, 'og:image') ?? '';
  const locale = meta(tlv, 'og:locale') ?? '';
  if (!title.includes('4,250,000')) {
    problems.push(`T4V7A og:title lost the exact price: ${title}`);
  }
  if (locale !== 'he_IL') {
    problems.push(`T4V7A og:locale is ${locale}, expected he_IL`);
  }
  if (!/^https?:\/\//.test(image)) {
    problems.push(`T4V7A og:image is not absolute: ${image}`);
  }
  if (image.includes('?')) {
    problems.push(`T4V7A og:image uses a query string (WhatsApp strips those): ${image}`);
  }
}

if (problems.length > 0) {
  console.error('\nOG title check FAILED:\n');
  problems.forEach((problem, index) => console.error(`  ${index + 1}. ${problem}`));
  process.exit(1);
}

console.log('OK: WhatsApp titles honor price mode; og:image is absolute with no query.');
