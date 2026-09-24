#!/usr/bin/env node
/**
 * Fails on translateX(...) in web/src that does not use var(--dir).
 *
 * transform is not a logical property. In RTL, "forward" on the inline axis
 * is negative X. A naked translateX(24px) always enters from physical right.
 *
 * Run: node scripts/verify-translate-dir.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'web/src';
const EXTENSIONS = new Set(['.astro', '.css', '.html', '.ts', '.tsx', '.mjs']);
// Two levels of nested parentheses, so the form this gate recommends —
// translateX(calc(var(--dir) * 24px)) — is read whole. A flat [^)]* stopped at
// the first ')' and failed that form too; nothing used translateX until the
// dashboard's chart tooltip, so it had never been exercised.
const TRANSLATE = /translateX\s*\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g;

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.astro') {
        continue;
      }
      out.push(...walk(full));
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

let failures = 0;

for (const file of walk(ROOT)) {
  const source = stripComments(fs.readFileSync(file, 'utf8'));
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    TRANSLATE.lastIndex = 0;
    let match;
    while ((match = TRANSLATE.exec(line))) {
      const inner = match[1] ?? '';
      if (!inner.includes('var(--dir)')) {
        console.error(`${file}:${index + 1}  ${line.trim()}`);
        failures += 1;
      }
    }
  });
}

if (failures > 0) {
  console.error(
    `\n${failures} translateX() without var(--dir) in web/src.\n` +
      'Write translateX(calc(var(--dir) * 24px)) so motion follows the inline axis.\n',
  );
  process.exit(1);
}

console.log('translateX uses --dir');
