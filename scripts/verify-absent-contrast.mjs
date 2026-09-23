#!/usr/bin/env node
/**
 * Asserts that a CONFIRMED ABSENCE is readable on every template.
 *
 * `present: false` — the fact the seller confirmed is absent, rendered as
 * אין — is the distinction CLAUDE.md §7 and PRD §2 both call the reason the
 * page reads as a description rather than an advertisement. It is only that
 * if a reader can actually read it.
 *
 * It was not. The cell used `opacity: .42` over --muted on --stone-warm,
 * which composites the text toward its own background: 4.35:1 before the
 * opacity, 1.70:1 as rendered. Measured on the built page, not estimated.
 * This check exists so that cannot come back silently.
 *
 * WHY IT IS PER TEMPLATE. Two of the seven invert the absent cell's ground —
 * the dark template leaves it transparent over a near-black page, and the
 * poster paints it into the dark caption band — so one --absent value cannot
 * serve all of them, and a check against the default ground alone would pass
 * while those two failed.
 *
 * Reads the BUILT css, like verify-template-divergences: a token that is
 * correct in source and overridden somewhere in the cascade is still wrong on
 * the page.
 *
 * Run after `npm run build` in web/:
 *   node scripts/verify-absent-contrast.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST = 'web/dist';
const PAGE = path.join(DIST, 'a', 'A7K2M', 'index.html');

if (!fs.existsSync(PAGE)) {
  console.error(`Missing build output: ${PAGE}\nRun the web build first.`);
  process.exit(1);
}

const html = fs.readFileSync(PAGE, 'utf8');

/** Every stylesheet the page links, concatenated with its inline blocks. */
const css = [
  ...(html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) ?? []),
  ...[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)]
    .map((tag) => tag[0].match(/href="([^"]+)"/)?.[1])
    .filter((href) => href && href.startsWith('/'))
    .map((href) => {
      const file = path.join(DIST, href.slice(1));
      if (!fs.existsSync(file)) {
        console.error(`Stylesheet referenced but missing from the build: ${href}`);
        process.exit(1);
      }
      return fs.readFileSync(file, 'utf8');
    }),
].join('\n');

// --- WCAG maths, the same as accents.test.ts -------------------------------
const luminance = (hex) => {
  const channel = (pair) => {
    const value = parseInt(pair, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel(hex.slice(1, 3)) +
    0.7152 * channel(hex.slice(3, 5)) +
    0.0722 * channel(hex.slice(5, 7))
  );
};

const contrast = (a, b) => {
  const [one, two] = [luminance(a), luminance(b)];
  return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
};

/** Expand #abc to #aabbcc so both spellings compare alike. */
const norm = (hex) => {
  const h = hex.trim().toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
};

/**
 * The ground each template's .fact.off actually sits on.
 *
 * Written out rather than derived, because deriving it means resolving the
 * cascade — and a check that reimplements the cascade is a check that can be
 * wrong in the same direction as the bug. These are asserted against the
 * built CSS below, so a template that changes its absent cell fails here
 * rather than drifting.
 */
const GROUNDS = {
  editorial: { token: '--stone-warm', expect: '#f1ede3' },
  agency: { token: '--stone-warm', expect: '#faf6f0' },
  sheet: { token: '--stone-warm', expect: '#f6f3ec' },
  ledger: { token: '--stone-warm', expect: '#f2efe6' },
  warm: { token: '--stone-warm', expect: '#fffdf8' },
  // Transparent over this template's own page ground.
  dark: { token: '--plaster', expect: '#14150f' },
  // Painted explicitly into the caption band.
  poster: { literal: '#1a1b10' },
};

const BAR = 4.5;
const problems = [];

/** The value of `prop` inside the rule block for `selector`, if present. */
const declared = (selector, prop) => {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'g');
  let found;
  let match;
  while ((match = block.exec(css)) !== null) {
    const decl = new RegExp(`${prop}\\s*:\\s*([^;}]+)`).exec(match[1]);
    if (decl) found = decl[1];
  }
  return found?.trim();
};

const baseAbsent = declared('html', '--absent');
if (!baseAbsent) {
  problems.push('No --absent token found in the built CSS. The check cannot run.');
}

for (const [template, ground] of Object.entries(GROUNDS)) {
  const override = declared(`html\\[data-template=['"]?${template}['"]?\\]`, '--absent');
  const absent = norm(override ?? baseAbsent ?? '');
  if (!/^#[0-9a-f]{6}$/.test(absent)) {
    problems.push(`${template}: --absent resolved to "${absent}", which is not a hex colour.`);
    continue;
  }

  let bg;
  if (ground.literal) {
    bg = norm(ground.literal);
  } else {
    const tplGround = declared(`html\\[data-template=['"]?${template}['"]?\\]`, ground.token);
    const rootGround = declared('html', ground.token) ?? declared(':root', ground.token);
    bg = norm(tplGround ?? rootGround ?? '');

    if (bg !== norm(ground.expect)) {
      problems.push(
        `${template}: the absent cell's ground is ${bg || '(not found)'} in the build but this\n` +
          `  check expects ${ground.expect}. The template changed; update GROUNDS here and\n` +
          '  re-measure rather than assuming the new ground is still readable.',
      );
      continue;
    }
  }

  const ratio = contrast(absent, bg);
  if (ratio < BAR) {
    problems.push(
      `${template}: אין renders at ${ratio.toFixed(2)}:1 (${absent} on ${bg}), under the ${BAR} bar.\n` +
        '  A confirmed absence nobody can read is the product quietly dropping the\n' +
        '  distinction between "the seller said there is none" and "nobody answered".',
    );
  } else {
    console.log(`  ${template.padEnd(10)} ${absent} on ${bg}  ${ratio.toFixed(2)}:1`);
  }
}

// The opacity that caused this is not allowed back.
if (/\.fact\.off[^{]*\{[^}]*opacity/.test(css)) {
  problems.push(
    'An opacity is applied to .fact.off again. Opacity composites the text toward\n' +
      '  its background and defeats every number above — that is how this rendered at\n' +
      '  1.70:1. Use a solid --absent value instead.',
  );
}

if (problems.length > 0) {
  console.error('\nAbsent-fact contrast check FAILED:\n');
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}\n`));
  process.exit(1);
}

console.log('OK: a confirmed absence clears 4.5:1 on every template.');
