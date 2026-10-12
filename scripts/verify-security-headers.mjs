#!/usr/bin/env node
/**
 * Every static page leaves with the security headers (12 Oct 2026).
 *
 * Cloudflare serves prerendered pages from the asset store before the Worker
 * runs, so `_headers` is the only place their headers come from. This reads
 * the BUILT file and checks its `/*` rule carries every header in
 * web/src/lib/security-headers.json with exactly that value — the list the
 * Worker's middleware applies too. A header dropped from the build, or a
 * value edited in one place and not the other, fails here.
 *
 * Run after the web build:
 *   node scripts/verify-security-headers.mjs [distRoot]
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST_ROOT = process.argv[2] ?? 'web/dist';
const clientRoot = fs.existsSync(path.join(DIST_ROOT, 'client')) ? path.join(DIST_ROOT, 'client') : DIST_ROOT;
const file = path.join(clientRoot, '_headers');
const expected = JSON.parse(fs.readFileSync('web/src/lib/security-headers.json', 'utf8'));

if (!fs.existsSync(file)) {
  console.error(`No _headers in ${clientRoot}. Run the web build first.`);
  process.exit(1);
}

/** The headers under the catch-all `/*` rule. */
const rules = fs.readFileSync(file, 'utf8').split(/\n(?=\S)/);
const all = rules.find((rule) => rule.split('\n')[0].trim() === '/*');
const found = new Map();
for (const line of (all ?? '').split('\n').slice(1)) {
  const match = /^\s+([\w-]+):\s*(.+?)\s*$/.exec(line);
  if (match) found.set(match[1].toLowerCase(), match[2]);
}

const problems = [];
if (!all) problems.push('no `/*` rule: static pages leave with no security headers at all.');
for (const [name, value] of Object.entries(expected)) {
  const got = found.get(name.toLowerCase());
  if (got === undefined) problems.push(`${name} is missing.`);
  else if (got !== value) problems.push(`${name} is "${got}", expected "${value}".`);
}
const hsts = expected['Strict-Transport-Security'] ?? '';
if (!/max-age=(\d+)/.test(hsts) || Number(/max-age=(\d+)/.exec(hsts)[1]) < 15552000) {
  problems.push('HSTS max-age is under six months: a browser forgets the https-only rule too soon.');
}

if (problems.length > 0) {
  console.error('Security headers check FAILED:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`OK: ${Object.keys(expected).length} security headers on every static page.`);
