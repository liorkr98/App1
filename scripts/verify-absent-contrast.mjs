#!/usr/bin/env node
/**
 * Asserts that a CONFIRMED ABSENCE is readable on every template.
 *
 * `present: false` — the fact the seller confirmed is absent, rendered as
 * אין — is the distinction CLAUDE.md §7 and PRD §2 both call the reason the
 * page reads as a description rather than an advertisement. It is only that
 * if a reader can actually read it, and nothing else in CI checks whether
 * they can: verify-a11y.mjs asserts that a contrast NOTE exists in
 * listing.css, which is a comment, not a measurement.
 *
 * TWO CHECKS, AND THE SECOND IS THE ONE THAT EARNS ITS KEEP.
 *
 *   1. --absent clears 4.5:1 against each template's own .fact.off ground.
 *      The grounds differ: dark leaves the cell transparent over a near-black
 *      page, the light templates tint it with --stone-warm, and linen's tint
 *      is several shades deeper than the shared one. One value cannot be
 *      assumed to serve all of them.
 *
 *   2. Nothing repaints the absent cell's text away from --absent. A template
 *      that sets `.fact.off .fact-lbl { color: var(--muted) }` passes check 1
 *      while rendering something else entirely — check 1 is then measuring a
 *      token the page does not use. That is not hypothetical: studio did
 *      exactly this, at 4.09:1, and a token-only gate would have called it
 *      green.
 *
 * Also refuses `opacity` on the cell. An opacity composites the text toward
 * its own background and defeats every number above; that is how this
 * rendered at 1.70:1 before --absent existed.
 *
 * Reads the BUILT css, like verify-template-divergences: a token that is
 * correct in source and overridden somewhere in the cascade is still wrong on
 * the page.
 *
 * Run after the web build:
 *   node scripts/verify-absent-contrast.mjs [distRoot]
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST_ROOT = process.argv[2] ?? 'web/dist';
const BAR = 4.5;

/** Astro's Cloudflare adapter nests the browser-facing build under client/. */
const clientRoot = fs.existsSync(path.join(DIST_ROOT, 'client'))
  ? path.join(DIST_ROOT, 'client')
  : DIST_ROOT;

const page = [
  path.join(clientRoot, 'template-check', 'A7K2M', 'index.html'),
  path.join(clientRoot, 'a', 'A7K2M', 'index.html'),
].find((file) => fs.existsSync(file));

if (!page) {
  console.error(`No built listing page found under ${clientRoot}. Run the web build first.`);
  process.exit(1);
}

const html = fs.readFileSync(page, 'utf8');

/** Inline <style> blocks plus every local stylesheet the page links. */
const css = [
  ...(html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) ?? []),
  ...[...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)]
    .map((tag) => tag[0].match(/href="([^"]+)"/)?.[1])
    .filter((href) => href && href.startsWith('/'))
    .map((href) => {
      const file = path.join(clientRoot, href.slice(1));
      if (!fs.existsSync(file)) {
        console.error(`Stylesheet referenced but missing from the build: ${href}`);
        process.exit(1);
      }
      return fs.readFileSync(file, 'utf8');
    }),
].join('\n');

/** The template ids, read from the one list that defines them. */
const listingTypes = fs.readFileSync('src/types/listing.ts', 'utf8');
const idBlock = /TEMPLATE_IDS\s*=\s*\[([\s\S]*?)\]/.exec(listingTypes);
if (!idBlock) {
  console.error('Could not read TEMPLATE_IDS from src/types/listing.ts.');
  process.exit(1);
}
const TEMPLATES = [...idBlock[1].matchAll(/['"]([\w-]+)['"]/g)].map((m) => m[1]);

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

/** Expand #abc so both spellings compare alike. */
const norm = (hex) => {
  const h = (hex ?? '').trim().toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
};

/**
 * The last value `prop` is given inside any rule whose selector matches.
 * Last, not first, because later declarations win at equal specificity and
 * these are all single-class or attribute selectors.
 */
const declared = (selectorPattern, prop) => {
  const block = new RegExp(`(?:^|[},])\\s*([^{}]*${selectorPattern}[^{}]*)\\{([^}]*)\\}`, 'g');
  let found;
  let match;
  while ((match = block.exec(css)) !== null) {
    const decl = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;}]+)`).exec(match[2]);
    if (decl) found = decl[1].trim();
  }
  return found;
};

const tplSel = (id) => `\\[data-template=['"]?${id}['"]?\\]`;

/** A token's value for one template, falling back to the root declaration. */
const token = (id, name) =>
  norm(declared(`${tplSel(id)}(?![^{]*\\s\\.)`, name) ?? declared('(?::root|html)(?![^{]*\\[)', name));

const problems = [];
const rows = [];

for (const id of TEMPLATES) {
  const absent = token(id, '--absent');
  if (!/^#[0-9a-f]{6}$/.test(absent)) {
    problems.push(`${id}: --absent resolved to "${absent || '(nothing)'}", which is not a hex colour.`);
    continue;
  }

  // The cell's ground: --stone-warm, unless the template repaints .fact.off.
  const offBackground = declared(`${tplSel(id)}[^{]*\\.fact\\.off`, 'background');
  let ground;
  let groundNote;
  // `background: transparent` survives minification as `background:0 0`, so
  // matching the word alone silently never fires — which is how this first
  // measured the dark template against a ground it does not use.
  if (offBackground && /^(transparent|none|0 0|0px 0px)$/.test(offBackground.trim())) {
    ground = token(id, '--plaster');
    groundNote = '--plaster (cell is transparent)';
  } else if (offBackground && /^#/.test(offBackground)) {
    ground = norm(offBackground);
    groundNote = 'literal';
  } else {
    ground = token(id, '--stone-warm');
    groundNote = '--stone-warm';
  }

  if (!/^#[0-9a-f]{6}$/.test(ground)) {
    problems.push(`${id}: the absent cell's ground resolved to "${ground || '(nothing)'}".`);
    continue;
  }

  const ratio = contrast(absent, ground);
  rows.push(`  ${id.padEnd(11)} ${absent} on ${ground} (${groundNote})  ${ratio.toFixed(2)}:1`);

  if (ratio < BAR) {
    problems.push(
      `${id}: אין renders at ${ratio.toFixed(2)}:1 (${absent} on ${ground}), under the ${BAR} bar.\n` +
        '  A confirmed absence nobody can read is the product quietly dropping the\n' +
        '  distinction between "the seller said there is none" and "nobody answered".',
    );
  }
}

// --- Check 2: nothing repaints the cell away from --absent -----------------
for (const match of css.matchAll(/([^{}]*\.fact\.off[^{}]*)\{([^}]*)\}/g)) {
  const [, selector, body] = match;

  const colour = /(?:^|;)\s*color\s*:\s*([^;}]+)/.exec(body);
  if (colour && !/var\(\s*--absent/.test(colour[1])) {
    // Repainting the whole cell is fine when it only sets a ground; this is
    // specifically about the text.
    const textish = /\.fact-lbl|\.fact-val/.test(selector) || !/background/.test(body);
    if (textish) {
      problems.push(
        `"${selector.trim()}" sets color: ${colour[1].trim()} on the absent cell.\n` +
          '  That bypasses --absent, so the contrast measured above is not the contrast\n' +
          '  rendered. Use var(--absent), or give this template its own --absent stop.',
      );
    }
  }

  if (/(?:^|;)\s*opacity\s*:\s*(?!1\b)/.test(body)) {
    problems.push(
      `"${selector.trim()}" applies an opacity to the absent cell.\n` +
        '  Opacity composites the text toward its background and defeats every number\n' +
        '  above — that is how this rendered at 1.70:1. Use a solid --absent value.',
    );
  }
}

if (problems.length > 0) {
  console.error('\nAbsent-fact contrast check FAILED:\n');
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}\n`));
  process.exit(1);
}

rows.forEach((row) => console.log(row));
console.log(`OK: a confirmed absence clears ${BAR}:1 on all ${TEMPLATES.length} templates.`);
