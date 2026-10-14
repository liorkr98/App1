import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { numbersIn, parseTranslation, translationInput, translationSource, translationSystem } from './translate.js';

const source = {
  title: 'דירת 4 חדרים\nליד דיזנגוף',
  description: 'דירה של 108 מ״ר בקומה 5, ועד בית ₪380. כניסה ב־03/2027.',
  priceNote: 'פינוי גמיש',
  disclosures: ['רטיבות קלה בחדר הרחצה'],
};

const good = {
  title: '4-room apartment\nnear Dizengoff',
  description: 'A 108 m² apartment on floor 5, building fee ₪380. Move-in 03/2027.',
  priceNote: 'Flexible move-in',
  disclosures: ['Slight damp in the bathroom'],
};

describe('translate (0044)', () => {
  it('reads numbers without their grouping', () => {
    assert.deepEqual(numbersIn('₪4,250,000 · 108 מ״ר · 3.5'), ['4250000', '108', '3.5']);
  });

  it('accepts a faithful translation', () => {
    const result = parseTranslation(JSON.stringify(good), source);
    assert.ok(result.ok);
    assert.equal(result.ok && result.draft.disclosures?.length, 1);
  });

  it('refuses one that lost or changed a number', () => {
    assert.deepEqual(parseTranslation(JSON.stringify({ ...good, description: 'A 180 m² apartment on floor 5, fee ₪380. Move-in 03/2027.' }), source), { ok: false, error: 'numbers' });
  });

  it('refuses what is not the shape asked for', () => {
    assert.deepEqual(parseTranslation('not json', source), { ok: false, error: 'malformed' });
    assert.deepEqual(parseTranslation(JSON.stringify({ title: 'x' }), source), { ok: false, error: 'malformed' });
    assert.deepEqual(parseTranslation(JSON.stringify({ ...good, disclosures: [] }), source), { ok: false, error: 'malformed' });
    assert.ok(parseTranslation('```json\n' + JSON.stringify(good) + '\n```', source).ok);
  });

  it('sends only the seller text, and asks to add nothing', () => {
    assert.deepEqual(Object.keys(JSON.parse(translationInput(source))), ['title', 'description', 'priceNote', 'disclosures']);
    assert.match(translationSystem('ru'), /Russian/);
    assert.match(translationSystem('ar'), /Add nothing/);
  });

  it('notices when the Hebrew changes', () => {
    assert.equal(translationSource(source), translationSource({ ...source }));
    assert.notEqual(translationSource(source), translationSource({ ...source, title: 'אחר' }));
  });
});
