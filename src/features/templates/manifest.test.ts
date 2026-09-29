import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { TEMPLATE_IDS } from '../../types/listing.js';
import {
  DEFAULT_TEMPLATE,
  LEGACY_TEMPLATE_ALIASES,
  TEMPLATE_MANIFEST,
  knownTemplateId,
  resolveTemplateId,
} from './manifest.js';

describe('template manifest', () => {
  it('has exactly one entry per template id', () => {
    assert.deepEqual(Object.keys(TEMPLATE_MANIFEST).sort(), [...TEMPLATE_IDS].sort());
  });

  it('resolves cinema, the P2 id, to Aurora', () => {
    assert.equal(resolveTemplateId('cinema'), 'aurora');
    assert.equal(knownTemplateId('cinema'), 'aurora');
  });

  it('never aliases to an id that does not exist', () => {
    for (const [from, to] of Object.entries(LEGACY_TEMPLATE_ALIASES)) {
      assert.ok((TEMPLATE_IDS as readonly string[]).includes(to), `${from} → ${to}`);
      assert.ok(!(TEMPLATE_IDS as readonly string[]).includes(from), `${from} is both an id and an alias`);
    }
  });

  it('falls back to the default only for rendering', () => {
    for (const bad of ['', 'Cinema', 'reel', 'constructor', '__proto__', null, 7]) {
      assert.equal(knownTemplateId(bad), undefined);
      assert.equal(resolveTemplateId(bad), DEFAULT_TEMPLATE);
    }
  });

  it('keeps every current id as itself', () => {
    for (const id of TEMPLATE_IDS) assert.equal(resolveTemplateId(id), id);
  });

  it('matches the set migration 0031 allows, and moves cinema rows to aurora', () => {
    const sql = readFileSync(
      new URL('../../../supabase/migrations/0031_templates_aurora_blueprint.sql', import.meta.url),
      'utf8',
    );
    const check = sql.slice(sql.indexOf('check (template in ('), sql.indexOf('));'));
    const allowed = [...check.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(allowed, [...TEMPLATE_IDS].sort());
    assert.match(sql, /set template = 'aurora'\s+where template = 'cinema'/);
  });

  it('gives every composed first screen a numeral count', () => {
    for (const [id, spec] of Object.entries(TEMPLATE_MANIFEST)) {
      if (spec.composed) assert.ok(spec.keyCells && spec.keyCells > 0, id);
    }
  });
});
