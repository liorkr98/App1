#!/usr/bin/env node
/**
 * Fails on physical left/right properties anywhere in web/.
 *
 * Mirrors the ESLint rule that protects the mobile app (CLAUDE.md §4.1), but
 * ESLint cannot see CSS, and Astro styles live in <style> blocks. A scan is
 * the tool that actually works here, and it costs no dependency.
 *
 * The failure this prevents is invisible in an English browser: `margin-left`
 * looks correct until the page is read right-to-left, at which point every
 * gutter is on the wrong side.
 *
 * Run: node scripts/verify-web-logical-props.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['web/src', 'web/public'];
const EXTENSIONS = new Set(['.astro', '.css', '.html', '.ts', '.tsx', '.mjs']);

/**
 * Matches a physical declaration, not a logical one. `border-inline-start`
 * contains neither "left" nor "right", so it cannot trip this.
 */
const PHYSICAL = [
  /(^|[\s;{"'`])(margin|padding|border|scroll-margin|scroll-padding)-(left|right)(-[a-z]+)?\s*:/g,
  /(^|[\s;{"'`])(left|right)\s*:/g,
  /text-align\s*:\s*(left|right)\b/g,
  /float\s*:\s*(left|right)\b/g,
  /clear\s*:\s*(left|right)\b/g,
];

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.astro') continue;
      out.push(...walk(full));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

/** Strips comments so prose about "the right side" cannot fail the build. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

let failures = 0;

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const raw = fs.readFileSync(file, 'utf8');
    const source = stripComments(raw);
    const lines = source.split('\n');

    lines.forEach((line, index) => {
      for (const pattern of PHYSICAL) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          console.error(`${file}:${index + 1}  ${line.trim()}`);
          failures += 1;
          break;
        }
      }
    });
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} physical left/right ${failures === 1 ? 'declaration' : 'declarations'} in web/.\n` +
      'Use logical properties: margin-inline-start, padding-inline-end, inset-inline,\n' +
      'border-inline-start, text-align:start/end. They follow reading direction;\n' +
      'left and right do not.\n',
  );
  process.exit(1);
}

console.log('OK: no physical left/right properties in web/.');
