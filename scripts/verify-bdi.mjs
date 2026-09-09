#!/usr/bin/env node
/**
 * Fails the build on a number rendered outside <bdi>.
 *
 * CLAUDE.md §4.2 and §12. Every number in Hebrew prose — price, floor, m²,
 * km, סמ״ק, year, phone, date, ratio, route number — and every run of Latin
 * text inside a Hebrew sentence has to sit inside a <bdi>, which isolates it
 * so the surrounding right-to-left text cannot reorder it.
 *
 * WHY A SCAN AND NOT A CODE REVIEW
 *
 * A missing <bdi> is invisible in the source and usually invisible on the
 * page too. `נכון ל־08/2026` renders correctly today with no isolation at
 * all, because the bidi algorithm resolves the run from the characters that
 * happen to surround it. Change the sentence — add a second number, move the
 * date next to a parenthesis — and the same markup silently reorders. So the
 * failure is not "this looks wrong", it is "this is one edit away from being
 * wrong, in a language most reviewers cannot proofread".
 *
 * That is exactly the kind of rule a human cannot hold, and a scan can.
 *
 * Runs against BUILT html, like verify-template-divergences.mjs, so it sees
 * what is actually served rather than what a component appears to emit.
 *
 * Run: node scripts/verify-bdi.mjs [dist-dir]
 */

import fs from 'node:fs';
import path from 'node:path';

const DIST = process.argv[2] ?? 'web/dist';

if (!fs.existsSync(DIST)) {
  console.error(`No build output at ${DIST}. Run the web build first.`);
  process.exit(1);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

/**
 * Everything that is not rendered prose.
 *
 * <head> carries og:title and a <title>, both of which contain numbers and
 * neither of which can hold an element — a meta attribute has no markup, and
 * WhatsApp reads the attribute, not the DOM. Scripts and styles are code.
 * <bdi> content is the answer, not the question.
 */
const NOT_PROSE = /<head[\s\S]*?<\/head>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<bdi[^>]*>[\s\S]*?<\/bdi>|<!--[\s\S]*?-->/gi;

/** Tag soup, minus the tags: what is left is the text a reader sees. */
const TAGS = /<[^>]+>/g;

const DIGIT = /\d/;

/**
 * The RTL acceptance fixture is exempt, and this is the only exemption.
 *
 * `/a/_rtltest` is one of the three hand-authored reference files
 * (docs/DESIGN-CONTRACT.md), and CLAUDE.md §4.5 requires its ten cases to
 * stay intact. Its numbered case headings — "1 · מחיר בן 7 ספרות" — are list
 * labels rather than prose, and case 7's five bare numerals are the TEST
 * MATERIAL: the whole point of that case is which side the digit 1 lands on,
 * so isolating it would delete the thing being checked.
 *
 * Editing the fixture to satisfy this scan would be the scan's first false
 * positive winning an argument against the contract it exists to protect.
 */
const EXEMPT = ['a/_rtltest/index.html'];

let failures = 0;

for (const file of walk(DIST).filter((name) => name.endsWith('.html')).sort()) {
  const route = path.relative(DIST, file).split(path.sep).join('/');
  if (EXEMPT.includes(route)) continue;

  const html = fs.readFileSync(file, 'utf8');

  const prose = html.replace(NOT_PROSE, ' ').replace(TAGS, '\n');

  for (const line of prose.split('\n')) {
    const text = line.trim();
    if (!text || !DIGIT.test(text)) continue;

    // An entity like &#8207; is markup, not a number a reader sees.
    if (/^&[#a-z0-9]+;$/i.test(text)) continue;

    console.error(`${route}  ${text}`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} number${failures === 1 ? '' : 's'} outside <bdi> in the built pages.\n` +
      'CLAUDE.md §4.2: every number in Hebrew prose goes in <bdi>. Without it the\n' +
      'bidi algorithm decides where the digits belong from whatever happens to sit\n' +
      'beside them, so a sentence that reads correctly today reorders the moment\n' +
      'the words around it change.\n\n' +
      'Interpolate the value as a slot and let the renderer wrap it — see\n' +
      'web/src/lib/i18n.ts and <Message>. Never concatenate a number into a\n' +
      'Hebrew string.',
  );
  process.exit(1);
}

console.log('OK: every number in the built pages is inside <bdi>.');
