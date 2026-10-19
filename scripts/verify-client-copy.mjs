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

import { PAGE_NAMESPACES, SERVER_ONLY_NAMESPACES } from '../web/integrations/client-copy.mjs';

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

/*
 * COPY PER PAGE (19 Oct 2026). A namespace in PAGE_NAMESPACES is not in the
 * browser's he.json at all; a page that reads it loads it with
 * lib/copy/<namespace>.ts, which calls addCopy("<namespace>", …). So a chunk
 * that names one of those keys must load it — itself, or through a chunk it
 * imports, statically and transitively. Inline module scripts in the built
 * HTML are chunks too: Astro writes small scripts into the page.
 */
const chunks = new Map();
for (const name of fs.readdirSync(ASTRO).filter((file) => /\.m?js$/.test(file))) {
  chunks.set(`_astro/${name}`, fs.readFileSync(path.join(ASTRO, name), 'utf8'));
}
const walkHtml = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walkHtml(full) : entry.name.endsWith('.html') ? [full] : [];
  });
for (const page of walkHtml(DIST)) {
  const html = fs.readFileSync(page, 'utf8');
  let index = 0;
  for (const match of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) {
    chunks.set(`${path.relative(DIST, page)} (inline script ${(index += 1)})`, match[1]);
  }
}
const IMPORT = /(?:import|from)\s*["'`](?:\/_astro\/|\.\/)([^"'`]+\.m?js)["'`]/g;
const importsOf = (code) => [...code.matchAll(IMPORT)].map((match) => `_astro/${match[1]}`);
// The minifier renames addCopy, so the call is known by its shape: a call
// whose first argument is the namespace, as lib/copy/<namespace>.ts writes it.
const loaderOf = (namespace) => new RegExp(`\\(\\s*["'\`]${namespace}["'\`]\\s*,`);
const loads = (start, namespace) => {
  const loader = loaderOf(namespace);
  const seen = new Set();
  const queue = [start];
  while (queue.length > 0) {
    const id = queue.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const code = chunks.get(id);
    if (code === undefined) continue;
    if (loader.test(code)) return true;
    queue.push(...importsOf(code));
  }
  return false;
};
const pageKey = new RegExp(`["'\`](${PAGE_NAMESPACES.join('|')})\\.[A-Za-z$]`, 'g');
for (const [id, code] of chunks) {
  const named = new Set([...code.matchAll(pageKey)].map((match) => match[1]));
  for (const namespace of named) {
    if (!loads(id, namespace)) {
      problems.push(`${id}: reads ${namespace}.* without loading it. Import web/src/lib/copy/${namespace}.ts first.`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\nA browser script reads copy the client build removes or does not load (${SERVER_ONLY_NAMESPACES.join(', ')}; ${PAGE_NAMESPACES.join(', ')} unless the page loads it).`);
  console.error('Move the string to a namespace the editor ships, render it in .astro, or import its lib/copy file.');
  process.exit(1);
}
console.log(`OK: none of ${scripts} client scripts reads ${SERVER_ONLY_NAMESPACES.join(', ')}; every one that reads ${PAGE_NAMESPACES.join(', ')} loads it.`);
