import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { TEMPLATE_IDS } from '../../types/listing.js';
import {
  CATALOGUE,
  CATEGORY_FALLBACK,
  DEFAULT_TEMPLATE,
  LEGACY_TEMPLATE_ALIASES,
  NEW_LISTING_TEMPLATE,
  pickerTemplates,
  TEMPLATE_MANIFEST,
  knownTemplateId,
  resolveTemplateId,
  templateFits,
  templateFor,
  templatesFor,
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

  it('matches the set the latest template migration (0033) allows', () => {
    const sql = readFileSync(
      new URL('../../../supabase/migrations/0033_templates_round_two.sql', import.meta.url),
      'utf8',
    );
    const check = sql.slice(sql.indexOf('check (template in ('), sql.indexOf('));'));
    const allowed = [...check.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(allowed, [...TEMPLATE_IDS].sort());
  });

  it('moves cinema rows to aurora in 0031', () => {
    const sql = readFileSync(
      new URL('../../../supabase/migrations/0031_templates_aurora_blueprint.sql', import.meta.url),
      'utf8',
    );
    assert.match(sql, /set template = 'aurora'\s+where template = 'cinema'/);
  });

  it('draws Showroom for cars only, and a flat that asks for it as Aurora', () => {
    assert.equal(templateFits('showroom', 'vehicle'), true);
    assert.equal(templateFits('showroom', 'property'), false);
    assert.equal(templateFor('showroom', 'property'), CATEGORY_FALLBACK);
    assert.equal(templateFor('showroom', 'vehicle'), 'showroom');
    assert.ok(!templatesFor('property').includes('showroom'));
    assert.ok(templatesFor('vehicle').includes('showroom'));
  });

  it('keeps Dossier for cars and Heliograph and Walk for homes', () => {
    assert.equal(templateFor('dossier', 'property'), CATEGORY_FALLBACK);
    assert.equal(templateFor('heliograph', 'vehicle'), CATEGORY_FALLBACK);
    assert.equal(templateFor('walk', 'vehicle'), CATEGORY_FALLBACK);
    assert.equal(templateFor('dossier', 'vehicle'), 'dossier');
    assert.equal(templateFor('heliograph', 'property'), 'heliograph');
  });

  it('lets every other template draw either category', () => {
    const oneCategory = new Set(['showroom', 'dossier', 'heliograph', 'walk']);
    for (const id of TEMPLATE_IDS) {
      if (oneCategory.has(id)) continue;
      assert.equal(templateFor(id, 'property'), id);
      assert.equal(templateFor(id, 'vehicle'), id);
    }
    assert.ok(templateFits(CATEGORY_FALLBACK, 'property') && templateFits(CATEGORY_FALLBACK, 'vehicle'));
  });

  it('gives every composed first screen a numeral count', () => {
    for (const [id, spec] of Object.entries(TEMPLATE_MANIFEST)) {
      if (spec.composed) assert.ok(spec.keyCells && spec.keyCells > 0, id);
    }
  });
});

describe('the catalogue the picker offers', () => {
  it('is the twelve chosen templates, each drawn by its own stage', () => {
    assert.equal(CATALOGUE.length, 12);
    for (const id of CATALOGUE) assert.ok(TEMPLATE_MANIFEST[id].composed, id);
  });

  it('offers homes ten and cars ten, never the other category\'s', () => {
    assert.equal(pickerTemplates('property').length, 10);
    assert.ok(!pickerTemplates('property').includes('showroom'));
    assert.equal(pickerTemplates('vehicle').length, 10);
    assert.ok(!pickerTemplates('vehicle').includes('heliograph'));
  });

  it('keeps an old listing\'s own template on offer, first', () => {
    assert.equal(pickerTemplates('property', 'agency')[0], 'agency');
    assert.deepEqual(pickerTemplates('property', 'aurora'), pickerTemplates('property'));
  });

  it('starts a new listing on a catalogue template', () => {
    assert.ok(CATALOGUE.includes(NEW_LISTING_TEMPLATE));
  });
});
