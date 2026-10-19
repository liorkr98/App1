import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * The owner runs each migration by pasting it into the Supabase SQL editor,
 * which splits a script into statements on its own and reads an apostrophe
 * in a COMMENT as the start of a string. 0046 failed that way, and 0047's
 * first line ("the agent's options") cut its function in two: Postgres got
 * a CREATE FUNCTION without its LANGUAGE (42P13). psql, and so CI, never
 * sees the problem. From 0044 on, a comment line carries no apostrophe;
 * the ones before are applied and are never rewritten.
 */
describe('migrations the owner pastes into the Supabase editor', () => {
  const files = readdirSync('supabase/migrations').filter((name) => /^\d{4}_.*\.sql$/.test(name) && Number(name.slice(0, 4)) >= 44);

  it('have no apostrophe in a comment', () => {
    assert.ok(files.length > 0);
    for (const name of files) {
      readFileSync(`supabase/migrations/${name}`, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const comment = line.indexOf('--');
          if (comment >= 0) assert.ok(!line.slice(comment).includes("'"), `${name}:${index + 1} has an apostrophe in a comment`);
        });
    }
  });
});
