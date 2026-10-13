#!/usr/bin/env node
/**
 * No browser script reads copy the client build removed (13 Oct 2026).
 *
 * web/integrations/client-copy.mjs strips the page-only namespaces
 * (templates, audiences, guides) from locales/*.json in the client build, so
 * the editor does not download text only .astro pages render. A client
 * bundle that names a key in one of them would show the raw key path to a
 * person. This reads every built client script for a string that starts
 * with one of those namespaces: "guides.title", 'templates.', `audiences.${…}`.
 *
 * Run after the web build:
 *   node scripts/verify-client-copy.mjs [distClientDir]
 */
import fs from 'node:fs';
import path from 'node:path';

import { SERVER_ONLY_NAMESPACES } from '../web/integrations/client-copy.mjs';

const DIST = process.argv[2] ?? 'web/dist/client';
const ASTRO = path.join(DIST, '_astro');
if (!fs.existsSync(ASTRO)) {
  console.error(`No client bundles at ${ASTRO}. Run the web build first.`);
  process.exit(1);
}

const key = new RegExp(`["'\`](${SERVER_ONLY_NAMESPACES.join('|')})\\.[A-Za-z$]`, 'g');
const problems = [];
let scripts = 0;
for (const name of fs.readdirSync(ASTRO).filter((file) => /\.m?js$/.test(file)).sort()) {
  scripts += 1;
  const code = fs.readFileSync(path.join(ASTRO, name), 'utf8');
  for (const match of code.matchAll(key)) {
    problems.push(`_astro/${name}: names ${code.slice(match.index + 1, match.index + 40).split(/["'`]/)[0]}…, which the client build removes.`);
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\nA browser script reads page-only copy (${SERVER_ONLY_NAMESPACES.join(', ')}).`);
  console.error('Move the string to a namespace the editor ships, or render it in .astro.');
  process.exit(1);
}
console.log(`OK: none of ${scripts} client scripts reads ${SERVER_ONLY_NAMESPACES.join(', ')}.`);
