import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

/**
 * JSON.parse keeps the LAST of two keys with the same name and says nothing.
 * On 11 Oct a second `editor.review` block (the photo advice) landed in both
 * locale files and silently replaced the first (the description check), so
 * that check showed raw key paths to the agent. This walks the text itself and
 * names every object that holds a key twice.
 */
function duplicateKeys(text: string): string[] {
  const found: string[] = [];
  let at = 0;

  const space = () => {
    while (/\s/.test(text[at] ?? '')) at += 1;
  };
  const string = (): string => {
    const start = at;
    at += 1;
    while (text[at] !== '"') at += text[at] === '\\' ? 2 : 1;
    at += 1;
    return JSON.parse(text.slice(start, at)) as string;
  };
  const value = (path: string): void => {
    space();
    const char = text[at];
    if (char === '{') {
      at += 1;
      const seen = new Set<string>();
      space();
      if (text[at] === '}') {
        at += 1;
        return;
      }
      for (;;) {
        space();
        const key = string();
        const here = path ? `${path}.${key}` : key;
        if (seen.has(key)) found.push(here);
        seen.add(key);
        space();
        at += 1; // the colon
        value(here);
        space();
        if (text[at] === ',') {
          at += 1;
          continue;
        }
        at += 1; // the closing brace
        return;
      }
    }
    if (char === '[') {
      at += 1;
      space();
      if (text[at] === ']') {
        at += 1;
        return;
      }
      for (let index = 0; ; index += 1) {
        value(`${path}[${index}]`);
        space();
        if (text[at] === ',') {
          at += 1;
          continue;
        }
        at += 1;
        return;
      }
    }
    if (char === '"') {
      string();
      return;
    }
    while (at < text.length && !/[,}\]\s]/.test(text[at] ?? '')) at += 1;
  };

  value('');
  return found;
}

describe('locale files', () => {
  it('finds a key written twice (the check fires)', () => {
    assert.deepEqual(duplicateKeys('{"a":{"x":"1","y":[1,{"z":2}]},"a":{"x":"2"}}'), ['a']);
    assert.deepEqual(duplicateKeys('{"e":{"r":{"t":"1"},"q":"\\"","r":{}}}'), ['e.r']);
    assert.deepEqual(duplicateKeys('{"a":1,"b":{"a":1}}'), []);
  });

  for (const file of ['he.json', 'en.json']) {
    it(`${file} holds every key once`, () => {
      const text = readFileSync(resolve(process.cwd(), 'locales', file), 'utf8');
      assert.deepEqual(duplicateKeys(text), []);
    });
  }
});
