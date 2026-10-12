#!/usr/bin/env node
/**
 * No price is written anywhere but the price list (docs/PRICING.md §9: "No
 * price literal exists in src/ outside the config/DB loader").
 *
 * Prices live in src/features/billing/pricing-config.ts, seeded into the
 * plans table by migration 0040. A "₪29" typed into a component is a second
 * price list that silently disagrees the day the first one changes — which
 * is how a page ends up promising a price nobody charges.
 *
 * What fails, outside pricing-config.ts and tests:
 *   - a shekel sign next to a written number in code (comments ignored);
 *   - an `amountAgorot` / `amount_agorot` given a number;
 *   - a shekel sign next to a number in locales/*.json, except the few keys
 *     below, which are not plan prices.
 * A line that must keep one (a font sample, say) says `price-literal-ok`.
 *
 *   node scripts/verify-no-price-literals.mjs [repoRoot]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] ?? '.';
const SCAN = ['src', 'web/src'];
const CONFIG = path.join('src', 'features', 'billing', 'pricing-config.ts');

/** Locale strings that mention a shekel amount and are not a plan price. */
const LOCALE_ALLOWED = new Map([
  ['editor.details.priceHint', 'explains that an empty listing price is not shown as ₪0'],
]);

const SHEKEL_NUMBER = /₪\s*\d|\d[\d,.]*\s*₪/;
const AGOROT_LITERAL = /\b(amountAgorot|amount_agorot)\s*[:=]\s*\d/;

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/<!--[\s\S]*?-->/g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');

const problems = [];

const walk = (dir) => {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(rel);
      continue;
    }
    if (!/\.(ts|tsx|astro|mjs|js)$/.test(entry.name) || /\.test\.ts$/.test(entry.name) || /\.d\.ts$/.test(entry.name)) continue;
    if (rel === CONFIG) continue;
    const original = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
    stripComments(original.join('\n'))
      .split('\n')
      .forEach((line, i) => {
        if (original[i]?.includes('price-literal-ok')) return;
        if (SHEKEL_NUMBER.test(line) || AGOROT_LITERAL.test(line)) {
          problems.push(`${rel}:${i + 1}: ${original[i]?.trim().slice(0, 100)}`);
        }
      });
  }
};
for (const dir of SCAN) walk(dir);

const localeDir = path.join(ROOT, 'locales');
for (const name of fs.existsSync(localeDir) ? fs.readdirSync(localeDir) : []) {
  if (!name.endsWith('.json')) continue;
  const visit = (node, at) => {
    if (typeof node === 'string') {
      if (SHEKEL_NUMBER.test(node) && !LOCALE_ALLOWED.has(at)) problems.push(`locales/${name}: ${at} = "${node.slice(0, 80)}"`);
      return;
    }
    if (node && typeof node === 'object') for (const [key, value] of Object.entries(node)) visit(value, at ? `${at}.${key}` : key);
  };
  visit(JSON.parse(fs.readFileSync(path.join(localeDir, name), 'utf8')), '');
}

if (!fs.existsSync(path.join(ROOT, CONFIG))) problems.push(`${CONFIG} is missing: there is no price list to read from.`);

if (problems.length > 0) {
  console.error('Price literal check FAILED. Prices belong in src/features/billing/pricing-config.ts only:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log('OK: no price written outside the price list.');
