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

  for (const file of ['he.json', 'en.json', 'ru.json', 'ar.json', 'strings/en.json', 'strings/ru.json', 'strings/ar.json']) {
    it(`${file} holds every key once`, () => {
      assert.deepEqual(duplicateKeys(read(file)), []);
    });
  }
});

/** Every key path that holds text, with its text. */
function leaves(value: unknown, path = ''): Map<string, string> {
  const found = new Map<string, string>();
  if (typeof value === 'string') found.set(path, value);
  else if (value && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      for (const [at, text] of leaves(inner, path ? `${path}.${key}` : key)) found.set(at, text);
    }
  }
  return found;
}

const read = (file: string) => readFileSync(resolve(process.cwd(), 'locales', file), 'utf8');
const placeholders = (text: string) => [...text.matchAll(/\{\w+\}/g)].map((match) => match[0]).sort();

/**
 * The listing page in another language (0044) looks a key up in that
 * language and falls back to Hebrew. A key Hebrew does not have would never
 * be asked for, and a `{value}` the translation dropped would leave a fact
 * without its number.
 */
describe('page languages', () => {
  const hebrew = leaves(JSON.parse(read('he.json')));

  for (const file of ['en.json', 'ru.json', 'ar.json']) {
    it(`${file}: every key exists in Hebrew and keeps its placeholders`, () => {
      for (const [key, text] of leaves(JSON.parse(read(file)))) {
        const source = hebrew.get(key);
        assert.ok(source !== undefined, `${file}: ${key} is not in he.json`);
        if (text) assert.deepEqual(placeholders(text), placeholders(source), `${file}: ${key}`);
      }
    });
  }

  it('ru.json and ar.json translate the same keys, none empty', () => {
    const russian = leaves(JSON.parse(read('ru.json')));
    const arabic = leaves(JSON.parse(read('ar.json')));
    assert.deepEqual([...russian.keys()].sort(), [...arabic.keys()].sort());
    for (const [key, text] of [...russian, ...arabic]) assert.ok(text.trim(), `${key} is empty`);
  });

  it('the Hebrew-text dictionaries cover the same phrases and keep their placeholders', () => {
    const files = ['strings/en.json', 'strings/ru.json', 'strings/ar.json'].map(
      (file) => [file, JSON.parse(read(file)) as Record<string, string>] as const,
    );
    const phrases = Object.keys(files[0]![1]).sort();
    for (const [file, strings] of files) {
      assert.deepEqual(Object.keys(strings).sort(), phrases, file);
      for (const [hebrewText, text] of Object.entries(strings)) {
        assert.ok(text.trim(), `${file}: ${hebrewText} is empty`);
        assert.deepEqual(placeholders(text), placeholders(hebrewText), `${file}: ${hebrewText}`);
      }
    }
  });
});
