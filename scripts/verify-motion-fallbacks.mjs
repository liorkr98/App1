#!/usr/bin/env node
/**
 * Asserts the scroll-driven motion degrades correctly.
 *
 * Stage B2 put the hero parallax, the section reveals and the progress line on
 * native scroll-driven animations, wrapped in both
 * `@media (prefers-reduced-motion: no-preference)` and
 * `@supports (animation-timeline: view())`. Support is roughly 84% globally,
 * so the remaining 16% and everyone who has asked for less motion see the page
 * with no animation at all — and it has to be a whole page.
 *
 * TWO WAYS THIS BREAKS, BOTH SILENT
 *
 * A reveal that sets `opacity: 0` outside the @supports block hides content
 * permanently in a browser that cannot animate it back. The page renders, the
 * build passes, and a third of the article is invisible to a Firefox user.
 *
 * An `animation-timeline` that escapes the reduced-motion wrapper moves the
 * page for a reader who asked it not to. Nothing errors; they just get the
 * thing they switched off.
 *
 * Neither is visible in review, because the CSS looks correct either way — the
 * nesting is the whole difference. So it is checked mechanically, against the
 * built stylesheets rather than the source.
 *
 * Run: node scripts/verify-motion-fallbacks.mjs [dist-dir]
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2] ?? 'web/dist';
const ASSETS = path.join(DIST, '_astro');

if (!fs.existsSync(ASSETS)) {
  console.error(`No built stylesheets at ${ASSETS}. Run the web build first.`);
  process.exit(1);
}

const sheets = fs
  .readdirSync(ASSETS)
  .filter((name) => name.endsWith('.css'))
  .map((name) => ({ name, css: fs.readFileSync(path.join(ASSETS, name), 'utf8') }));

/** Removes every at-rule block whose text starts with `name`, braces balanced. */
function stripAtRule(source, name) {
  let out = '';
  let index = 0;

  while (index < source.length) {
    if (source.startsWith(name, index)) {
      let cursor = source.indexOf('{', index) + 1;
      let depth = 1;
      while (cursor < source.length && depth > 0) {
        if (source[cursor] === '{') depth += 1;
        else if (source[cursor] === '}') depth -= 1;
        cursor += 1;
      }
      index = cursor;
      continue;
    }
    out += source[index];
    index += 1;
  }

  return out;
}

const problems = [];

for (const { name, css } of sheets) {
  const withoutSupports = stripAtRule(css, '@supports');

  // 1. Nothing that hides content may survive without scroll-driven support.
  if (withoutSupports.includes('.reveal')) {
    problems.push(
      `${name}: .reveal has rules OUTSIDE @supports.\n` +
        '    A browser without animation-timeline would apply them and never animate\n' +
        '    them away. If one of them is opacity:0, that content is gone for good.',
    );
  }

  // 2. The hero image still needs its layout when the parallax cannot run.
  if (css.includes('.hero-img') && !withoutSupports.includes('.hero-img')) {
    problems.push(
      `${name}: .hero-img exists ONLY inside @supports.\n` +
        '    Its position, size and object-fit are what make the hero a hero. Without\n' +
        '    them an unsupporting browser gets an unpositioned image.',
    );
  }

  // 3. Scroll-driven motion must sit inside BOTH wrappers.
  if (withoutSupports.includes('animation-timeline')) {
    problems.push(
      `${name}: animation-timeline appears outside @supports.\n` +
        '    That is the feature detection itself — outside it, the declaration is\n' +
        '    simply dropped by browsers that do not have it, and any transform or\n' +
        '    opacity it was meant to drive is left applied.',
    );
  }

  const withoutMotionQuery = stripAtRule(css, '@media (prefers-reduced-motion:no-preference)');
  if (withoutMotionQuery.includes('animation-timeline')) {
    problems.push(
      `${name}: animation-timeline survives prefers-reduced-motion: reduce.\n` +
        '    A reader who asked for less movement would still get the parallax.',
    );
  }
}

if (problems.length > 0) {
  console.error('\nMotion fallback check FAILED:\n');
  problems.forEach((problem, index) => console.error(`  ${index + 1}. ${problem}\n`));
  process.exit(1);
}

console.log('OK: scroll-driven motion degrades correctly.');
console.log('  .reveal has no rules outside @supports — content is never left hidden');
console.log('  .hero-img keeps its layout without animation-timeline');
console.log('  animation-timeline sits inside both @supports and the reduced-motion query');
