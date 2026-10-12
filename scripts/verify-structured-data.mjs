#!/usr/bin/env node
/**
 * Structured data in the build is valid, private and consistent (SEO plan
 * §4.2, 12 Oct 2026).
 *
 *   1. Every application/ld+json block parses. A block that does not is
 *      ignored by every search engine, silently.
 *   2. No coordinates anywhere (geo, latitude, longitude). The street, never
 *      the building (CLAUDE.md §7): a GeoCoordinates node on a listing is a
 *      pin by another name, readable by every crawler.
 *   3. Every indexable site page carries the Organization, with the brand
 *      name and the one description from locales/he.json. Assistants trust
 *      an entity when all its sources agree; one page with a stale name is
 *      a second entity.
 *
 * Run after the web build:
 *   node scripts/verify-structured-data.mjs [distClientDir]
 */
import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2] ?? 'web/dist/client';
const he = JSON.parse(fs.readFileSync('locales/he.json', 'utf8'));
const BRAND = he.common.brand;
const SUMMARY = he.seo.summary;

if (!fs.existsSync(DIST)) {
  console.error(`No build at ${DIST}. Run the web build first.`);
  process.exit(1);
}

const pages = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) pages.push(full);
  }
};
walk(DIST);

const decode = (text) =>
  text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const problems = [];
let blocks = 0;
let sitePages = 0;

const nodesOf = (doc) => (Array.isArray(doc['@graph']) ? doc['@graph'] : [doc]);
const hasCoordinates = (value) => {
  if (Array.isArray(value)) return value.some(hasCoordinates);
  if (value && typeof value === 'object') {
    return Object.entries(value).some(
      ([key, inner]) => /^(geo|latitude|longitude)$/i.test(key) || inner?.['@type'] === 'GeoCoordinates' || hasCoordinates(inner),
    );
  }
  return false;
};

for (const file of pages) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(DIST, file);
  const docs = [];
  for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    blocks += 1;
    try {
      docs.push(JSON.parse(match[1]));
    } catch {
      try {
        docs.push(JSON.parse(decode(match[1])));
      } catch (error) {
        problems.push(`${rel}: a JSON-LD block does not parse (${error.message}).`);
      }
    }
  }
  for (const doc of docs) {
    if (hasCoordinates(doc)) problems.push(`${rel}: structured data carries coordinates — a location pin by another name.`);
  }

  // Indexable site pages (not listings, not CI fixtures).
  const robots = /<meta name="robots" content="([^"]*)"/.exec(html)?.[1] ?? '';
  if (!robots.startsWith('index') || rel.startsWith('a/') || rel.startsWith('template-check/')) continue;
  sitePages += 1;
  const org = docs.flatMap(nodesOf).find((node) => node['@type'] === 'Organization');
  if (!org) {
    problems.push(`${rel}: indexable, but no Organization in its structured data.`);
    continue;
  }
  if (org.name !== BRAND) problems.push(`${rel}: Organization name is "${org.name}", the brand is "${BRAND}".`);
  if (org.description !== SUMMARY) problems.push(`${rel}: Organization description is not seo.summary — every source must say the same thing.`);
}

if (sitePages === 0) problems.push('No indexable site page found: the Organization check measured nothing.');

if (problems.length > 0) {
  console.error('Structured data check FAILED:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`OK: ${blocks} JSON-LD blocks parse, none with coordinates; ${sitePages} indexable site pages name the same Organization.`);
