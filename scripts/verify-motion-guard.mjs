#!/usr/bin/env node
/**
 * Every animation sits behind prefers-reduced-motion.
 *
 * verify-motion-fallbacks.mjs checks the scroll-driven half: a timeline
 * outside @supports, or outside the reduced-motion query. This checks the
 * other half, which that script cannot see — ordinary keyframe animations.
 * A breathing photograph, a sheen on a button, a counter's flourish: each is
 * motion a reader switched off, and each is one missing @media wrapper away
 * from running anyway.
 *
 * Rule: in the built stylesheets, any `animation` or `animation-name` whose
 * value is not `none` must be inside
 * `@media (prefers-reduced-motion: no-preference)`.
 *
 * Scope: the stylesheets the LISTING PAGE ships (the page buyers open, and
 * the one this product sells). Site pages (homepage, dashboard) join in P5
 * when they move onto the Living Surfaces system.
 *
 * Run after the web build: node scripts/verify-motion-guard.mjs [dist]
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2] ?? 'web/dist/client';
const PAGE = path.join(DIST, 'template-check', 'A7K2M', 'index.html');

if (!fs.existsSync(PAGE)) {
  console.error(`No built listing page at ${PAGE}. Run the web build first.`);
  process.exit(1);
}

const html = fs.readFileSync(PAGE, 'utf8');
const sheets = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((href) => href.startsWith('/'))
  .map((href) => ({ name: href, css: fs.readFileSync(path.join(DIST, href.slice(1)), 'utf8') }));
const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m, i) => ({ name: `inline#${i}`, css: m[1] }));

if (sheets.length + inline.length === 0) {
  console.error('The listing page links no stylesheet — the check would pass while checking nothing.');
  process.exit(1);
}

/** Removes every block that starts with one of `prefixes`, braces balanced. */
function strip(source, prefixes) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const hit = prefixes.find((p) => source.startsWith(p, i));
    if (hit) {
      let cursor = source.indexOf('{', i) + 1;
      let depth = 1;
      while (cursor < source.length && depth > 0) {
        if (source[cursor] === '{') depth += 1;
        else if (source[cursor] === '}') depth -= 1;
        cursor += 1;
      }
      i = cursor;
      continue;
    }
    out += source[i];
    i += 1;
  }
  return out;
}

const GUARDS = ['@media (prefers-reduced-motion:no-preference)', '@media (prefers-reduced-motion: no-preference)'];
const problems = [];

for (const { name, css } of [...sheets, ...inline]) {
  // Keyframe bodies are not declarations of an animation; drop them too.
  const outside = strip(strip(css, GUARDS), ['@keyframes', '@-webkit-keyframes']);
  for (const m of outside.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    for (const decl of m[2].split(';')) {
      const [prop, ...rest] = decl.split(':');
      const p = (prop ?? '').trim();
      const value = rest.join(':').trim().replace(/!important/, '').trim();
      if ((p === 'animation' || p === 'animation-name') && value && !/^(none|initial|unset|inherit)$/.test(value)) {
        problems.push(`${name}: ${selector} { ${p}: ${value} }`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error('\nMotion guard FAILED — animations outside prefers-reduced-motion:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nWrap them in @media (prefers-reduced-motion: no-preference). See web/src/motion/motion.css.\n');
  process.exit(1);
}

console.log(`OK: every animation on the listing page sits behind prefers-reduced-motion (${sheets.length + inline.length} stylesheets).`);
