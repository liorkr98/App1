import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isHebrew, tagFilterExpressions, toCategory, toName } from './categories.js';

/**
 * The tag mapping and the name choice are the only parts of the OSM pipeline
 * testable without the extract — and they are where a bug is invisible. A
 * museum filed as a café and a Latin name among Hebrew both produce a page
 * that renders perfectly and reads wrong.
 */

describe('toCategory', () => {
  it('maps each category from its primary tag', () => {
    assert.equal(toCategory({ amenity: 'restaurant' }), 'restaurant');
    assert.equal(toCategory({ amenity: 'cafe' }), 'cafe');
    assert.equal(toCategory({ shop: 'supermarket' }), 'grocery');
    assert.equal(toCategory({ amenity: 'pharmacy' }), 'pharmacy');
    assert.equal(toCategory({ leisure: 'park' }), 'park');
    assert.equal(toCategory({ tourism: 'museum' }), 'culture');
    assert.equal(toCategory({ leisure: 'fitness_centre' }), 'gym');
  });

  it('resolves overlapping tags by priority, not by tag order', () => {
    // A museum with a café inside is a museum. Object key order must not
    // decide this, which is why the rules are an ordered list.
    assert.equal(toCategory({ amenity: 'cafe', tourism: 'museum' }), 'culture');
    assert.equal(toCategory({ tourism: 'museum', amenity: 'cafe' }), 'culture');

    // A supermarket with a deli counter is a supermarket — "nearest grocery"
    // is a summary field people act on.
    assert.equal(toCategory({ amenity: 'restaurant', shop: 'supermarket' }), 'grocery');
  });

  it('returns undefined for anything we do not display', () => {
    assert.equal(toCategory({ power: 'tower' }), undefined);
    assert.equal(toCategory({ highway: 'bus_stop' }), undefined);
    assert.equal(toCategory({}), undefined);
  });
});

describe('tagFilterExpressions', () => {
  it('covers every rule, deduplicated', () => {
    const expressions = tagFilterExpressions();

    assert.ok(expressions.includes('amenity=restaurant'));
    assert.ok(expressions.includes('tourism=museum'));
    assert.ok(expressions.includes('leisure=park'));
    assert.equal(new Set(expressions).size, expressions.length);
  });

  it('produces a filter that matches what toCategory accepts', () => {
    // If these drift apart, pass one imports tags pass two then discards —
    // wasted work — or worse, filters out something we would have shown.
    for (const expression of tagFilterExpressions()) {
      const [key, value] = expression.split('=');
      assert.ok(key && value, expression);
      assert.ok(toCategory({ [key]: value }), `${expression} filtered but not categorised`);
    }
  });
});

describe('toName', () => {
  it('prefers the Hebrew name', () => {
    // OSM's plain `name` in Israel is often a Latin transliteration, and a
    // Hebrew page listing "Cafe Landwer" among Hebrew names reads as broken.
    assert.equal(toName({ 'name:he': 'קפה לנדוור', name: 'Cafe Landwer' }), 'קפה לנדוור');
  });

  it('falls back to name when there is no Hebrew one', () => {
    assert.equal(toName({ name: 'Sarona Market' }), 'Sarona Market');
  });

  it('ignores empty and whitespace-only names', () => {
    assert.equal(toName({ 'name:he': '   ', name: 'Real Name' }), 'Real Name');
    assert.equal(toName({ name: '' }), undefined);
  });

  it('returns undefined when there is no name at all', () => {
    // Omitted rather than labelled "פארק" — a placeholder is what §7 forbids.
    assert.equal(toName({ leisure: 'park' }), undefined);
  });

  it('trims, because OSM data is hand-entered', () => {
    assert.equal(toName({ 'name:he': '  גן מאיר  ' }), 'גן מאיר');
  });
});

describe('isHebrew', () => {
  it('detects Hebrew', () => {
    assert.equal(isHebrew('גן מאיר'), true);
    assert.equal(isHebrew('פארק הירקון'), true);
  });

  it('is false for Latin-only names, which are counted not rejected', () => {
    assert.equal(isHebrew('Sarona Market'), false);
    assert.equal(isHebrew(''), false);
  });

  it('is true for a mixed name', () => {
    assert.equal(isHebrew('BASEL קפה'), true);
  });
});
