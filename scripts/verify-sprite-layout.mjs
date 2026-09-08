#!/usr/bin/env node
/**
 * The sprite sheet contract, checked across the boundary.
 *
 * The pipeline lays 36 frames onto a grid and the viewer reads them back off
 * it with background-position. Those two calculations live in different
 * packages — worker/ and web/ share no module — so they are duplicated, and a
 * duplicated calculation drifts.
 *
 * What makes this worth a CI step is HOW it fails. If the two disagree, the
 * sheet still loads, the drag still works, and the spin simply shows the wrong
 * frame: a car that jumps from the bonnet to the boot and back. Nothing throws,
 * nothing 404s, and no unit test on either side can see it, because each side
 * is self-consistent.
 *
 * Comparing the function bodies rather than the outputs is deliberate: two
 * implementations can agree on 36 and disagree on 25, and the frame count is
 * configurable.
 */
import fs from 'node:fs';

const SOURCES = [
  { file: 'worker/src/video/angles.ts', label: 'pipeline' },
  { file: 'web/src/lib/viewers/spin.ts', label: 'viewer' },
];

/**
 * Body of `function gridFor(...)`, from its opening brace to the match.
 *
 * The return type is an object literal — `): { columns: number; rows: number }`
 * — so "the first brace after the parameter list" finds the TYPE, not the body.
 * The pattern skips an optional return annotation, object form or not.
 */
const SIGNATURE = /function gridFor\s*\([^)]*\)\s*(?::\s*(?:\{[^{}]*\}|[^{;]+?))?\s*\{/;

function extractBody(source, file) {
  const signature = SIGNATURE.exec(source);
  if (!signature) {
    console.error(`FAIL: no gridFor() in ${file}.`);
    console.error('Both sides of the sprite contract must define it by that name.');
    process.exit(1);
  }

  const open = signature.index + signature[0].length - 1;
  let depth = 0;

  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }

  console.error(`FAIL: gridFor() in ${file} is unbalanced.`);
  process.exit(1);
}

/** Whitespace and trailing commas only. Anything else is a real difference. */
const normalise = (body) => body.replace(/\s+/g, ' ').replace(/,\s*([)}])/g, '$1').trim();

const bodies = SOURCES.map(({ file, label }) => {
  const source = fs.readFileSync(file, 'utf8');
  return { file, label, body: normalise(extractBody(source, file)) };
});

const [first, second] = bodies;

if (first.body !== second.body) {
  console.error('FAIL: the sprite grid calculations have drifted apart.');
  console.error('');
  for (const { file, label, body } of bodies) {
    console.error(`  ${label} (${file}):`);
    console.error(`    ${body}`);
  }
  console.error('');
  console.error('A mismatch does not break the build or the page. It makes the spin');
  console.error('show the wrong frame, which reads as a bad capture rather than a bug.');
  process.exit(1);
}

console.log('OK: the pipeline and the viewer lay the sprite sheet out identically.');
console.log(`    ${first.body}`);
