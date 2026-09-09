import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dominantMode, toMode, UnmappedRouteType } from './mode.js';
import { lineEnd, splitLine } from './csv.js';

/**
 * These two modules are the only parts of the GTFS pipeline that can be tested
 * without the feed. They are also the two where a bug is invisible: a
 * mis-parsed CSV line and a mislabelled mode both produce a page that looks
 * perfectly fine and says something false.
 */

describe('toMode', () => {
  it('maps the basic types from the specification', () => {
    assert.equal(toMode('0'), 'light_rail');
    assert.equal(toMode('1'), 'metro');
    assert.equal(toMode('2'), 'train');
    assert.equal(toMode('3'), 'bus');
  });

  it('maps the extended ranges by hundred, not by exact value', () => {
    // The extended set defines a base per hundred with subtypes beneath it,
    // so 900 and 906 are both tram-like.
    assert.equal(toMode('900'), 'light_rail');
    assert.equal(toMode('906'), 'light_rail');
    assert.equal(toMode('109'), 'train');
    assert.equal(toMode('401'), 'metro');
    assert.equal(toMode('715'), 'bus');
  });

  it('tolerates surrounding whitespace, which feeds do contain', () => {
    assert.equal(toMode(' 0 '), 'light_rail');
  });

  it('THROWS on an unmapped type rather than defaulting to bus', () => {
    // This is the most important assertion in the file. A default would make
    // the sync succeed and the light rail vanish into "bus" — wrong, silent,
    // and discovered by a reader rather than by us.
    assert.throws(() => toMode('4'), UnmappedRouteType); // ferry
    assert.throws(() => toMode('1501'), UnmappedRouteType);
    assert.throws(() => toMode(''), UnmappedRouteType);
    assert.throws(() => toMode('bus'), UnmappedRouteType);
  });

  it('names the offending value in the error, so the fix is obvious', () => {
    assert.throws(() => toMode('4'), (error: unknown) => {
      assert.ok(error instanceof UnmappedRouteType);
      assert.equal(error.routeType, '4');
      assert.match(error.message, /mode\.ts/);
      return true;
    });
  });
});

describe('dominantMode', () => {
  it('lets light rail win over any number of buses', () => {
    assert.equal(dominantMode(['bus', 'bus', 'light_rail', 'bus']), 'light_rail');
  });

  it('ranks by usefulness to a reader, not by frequency', () => {
    assert.equal(dominantMode(['bus', 'train']), 'train');
    assert.equal(dominantMode(['train', 'metro']), 'metro');
    assert.equal(dominantMode(['metro', 'light_rail']), 'light_rail');
  });

  it('leaves a single mode alone', () => {
    assert.equal(dominantMode(['bus']), 'bus');
  });
});

describe('splitLine', () => {
  it('splits a plain row', () => {
    assert.deepEqual(splitLine('1,2,3'), ['1', '2', '3']);
  });

  it('keeps a comma inside quotes — a real Hebrew stop name case', () => {
    assert.deepEqual(splitLine('1,"רחוב הרצל, פינת אלנבי",3'), [
      '1',
      'רחוב הרצל, פינת אלנבי',
      '3',
    ]);
  });

  it('unescapes a doubled quote', () => {
    assert.deepEqual(splitLine('a,"say ""hi""",c'), ['a', 'say "hi"', 'c']);
  });

  it('preserves empty fields, which carry meaning in GTFS', () => {
    assert.deepEqual(splitLine('a,,c'), ['a', '', 'c']);
    assert.deepEqual(splitLine(',,'), ['', '', '']);
  });
});

describe('lineEnd', () => {
  it('finds an ordinary newline', () => {
    assert.equal(lineEnd('abc\ndef'), 3);
  });

  it('ignores a newline inside a quoted field', () => {
    // Splitting here would shift every later field by one, putting a
    // coordinate where a name belongs.
    assert.equal(lineEnd('a,"line\nbreak",c\nnext'), 16);
  });

  it('handles a doubled quote without losing quote state', () => {
    assert.equal(lineEnd('a,"say ""hi""",c\nnext'), 16);
  });

  it('returns -1 when the buffer holds no complete line', () => {
    assert.equal(lineEnd('a,b,c'), -1);
    assert.equal(lineEnd('a,"unterminated\n'), -1);
  });
});
