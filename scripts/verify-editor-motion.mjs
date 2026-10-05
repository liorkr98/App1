#!/usr/bin/env node
/**
 * Every control in the editor answers a touch.
 *
 * On 5 Oct 2026 an agent reported that a lot of the new-listing flow "has no
 * motion", and an audit agreed: 24 of 31 clickable things in
 * web/src/components/editor had no press and no hover state at all. Tapping
 * one on a phone gave nothing back until the next screen arrived, which reads
 * as a button that did not work. They were fixed together; this keeps them
 * fixed, because the next new button is the one that forgets.
 *
 * Rule: every <button>, <summary>, classed <a>, and every <label> or element
 * that carries a className and an onClick, in web/src/components/editor/*.tsx,
 * has at least one of its classes in a selector with `:active` or `:hover` in
 * web/src/styles/editor.css. An interactive element with no className at all
 * fails too — it cannot have a state rule of its own.
 *
 * It reads the source, not the build: the class names are only meaningful
 * next to the component that uses them, and the failure message names both.
 *
 * Run: node scripts/verify-editor-motion.mjs [components-dir] [css-file]
 */

import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] ?? 'web/src/components/editor';
const CSS = process.argv[3] ?? 'web/src/styles/editor.css';

/** The opening tag starting at `start` ("<"), braces and strings respected. */
function openingTag(source, start) {
  let depth = 0;
  let quote = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') quote = char;
    else if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    else if (char === '>' && depth === 0) return source.slice(start, index + 1);
  }
  return source.slice(start);
}

/** Every class token the className attribute can produce, literal or not. */
function classTokens(tag) {
  const at = tag.indexOf('className=');
  if (at === -1) return [];
  const rest = tag.slice(at + 'className='.length);
  let value = '';
  if (rest.startsWith('"') || rest.startsWith("'")) {
    value = rest.slice(1, rest.indexOf(rest[0], 1));
  } else if (rest.startsWith('{')) {
    let depth = 0;
    let end = 0;
    for (; end < rest.length; end += 1) {
      if (rest[end] === '{') depth += 1;
      else if (rest[end] === '}' && --depth === 0) break;
    }
    const expression = rest.slice(1, end).replace(/\$\{[^}]*\}/g, ' ');
    value = [...expression.matchAll(/(["'`])((?:(?!\1).)*)\1/g)].map((m) => m[2]).join(' ');
  }
  return value.split(/\s+/).filter((token) => /^[a-z][\w-]*$/i.test(token));
}

const css = fs.readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = [...css.matchAll(/([^{}@;]+)\{/g)]
  .flatMap((m) => m[1].split(','))
  .map((selector) => selector.trim());

function hasState(token) {
  const own = new RegExp(`\\.${token}(?![\\w-])[^\\s>+~]*:(active|hover)`);
  return selectors.some((selector) => own.test(selector));
}

const INTERACTIVE = /<(button|a|summary|label|div|span|li)\b/g;
const failures = [];
let checked = 0;

for (const file of fs.readdirSync(DIR).filter((name) => name.endsWith('.tsx')).sort()) {
  const source = fs.readFileSync(path.join(DIR, file), 'utf8');
  for (const match of source.matchAll(INTERACTIVE)) {
    const element = match[1];
    const tag = openingTag(source, match.index);
    const clickable =
      element === 'button' ||
      element === 'summary' ||
      // A link in a sentence is styled as a link; a link styled as a button
      // carries a class, and that one is checked.
      (element === 'a' && /\bhref=/.test(tag) && /\bclassName=/.test(tag)) ||
      (/\bclassName=/.test(tag) && /\bonClick=/.test(tag)) ||
      (element === 'label' && /\bclassName=/.test(tag));
    if (!clickable) continue;
    checked += 1;

    const line = source.slice(0, match.index).split('\n').length;
    const tokens = classTokens(tag);
    if (tokens.length === 0) {
      failures.push(`${file}:${line} <${element}> has no className, so it can have no press or hover state`);
      continue;
    }
    if (!tokens.some(hasState)) {
      failures.push(`${file}:${line} <${element} class="${tokens.join(' ')}"> has no :active or :hover rule in ${CSS}`);
    }
  }
}

if (checked === 0) {
  console.error(`No interactive elements found in ${DIR}; the check is not looking where it should.`);
  process.exit(1);
}

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} of ${checked} editor controls give no feedback when touched:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`OK: all ${checked} editor controls have a press or hover state.`);
