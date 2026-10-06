import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { coverCrop, fitSize, shareImagePath, wrapLines } from './card-layout.js';

// One unit per character: easy to reason about, and the wrapping only ever
// asks "is this wider than that".
const byLength = (text: string) => text.length;

describe('wrapLines', () => {
  it('breaks at spaces without exceeding the width', () => {
    const lines = wrapLines('דירת ארבעה חדרים ליד דיזנגוף', 12, byLength, 4);
    assert.deepEqual(lines, ['דירת ארבעה', 'חדרים ליד', 'דיזנגוף']);
    for (const line of lines) assert.ok(line.length <= 12);
  });

  it('ends the last allowed line with an ellipsis when the text does not fit', () => {
    const lines = wrapLines('אחת שתיים שלוש ארבע חמש שש', 10, byLength, 2);
    assert.equal(lines.length, 2);
    assert.ok(lines[1]!.endsWith('…'));
    assert.ok(lines[1]!.length <= 10);
  });

  it('keeps a word longer than the line whole', () => {
    assert.deepEqual(wrapLines('תל־אביב־יפו', 4, byLength, 3), ['תל־אביב־יפו']);
  });

  it('collapses newlines and repeated spaces', () => {
    assert.deepEqual(wrapLines('שורה\nשנייה   כאן', 40, byLength, 2), ['שורה שנייה כאן']);
  });

  it('returns nothing for empty text', () => {
    assert.deepEqual(wrapLines('   ', 10, byLength, 2), []);
  });
});

describe('fitSize', () => {
  it('picks the largest size at which the text fits', () => {
    // At size s every character is s/10 wide; the line is 100 wide.
    const at = (size: number) => (text: string) => (text.length * size) / 10;
    // 14 characters: 100.8 wide at 72 (over), 84 at 60 (fits on one line).
    assert.equal(fitSize('אחת שתיים שלוש', [72, 60, 50], 100, at, 1), 60);
  });

  it('falls back to the smallest size', () => {
    const at = (size: number) => (text: string) => text.length * size;
    assert.equal(fitSize('אחת שתיים שלוש ארבע', [72, 60, 50], 10, at, 1), 50);
  });
});

describe('coverCrop', () => {
  it('crops the sides of a wide photo into a square, centred', () => {
    assert.deepEqual(coverCrop(2000, 1000, 500, 500), { sx: 500, sy: 0, sw: 1000, sh: 1000 });
  });

  it('follows the focal point like object-position', () => {
    assert.equal(coverCrop(2000, 1000, 500, 500, 0, 50).sx, 0);
    assert.equal(coverCrop(2000, 1000, 500, 500, 100, 50).sx, 1000);
  });

  it('crops top and bottom of a tall photo for a wide card', () => {
    const crop = coverCrop(1000, 2000, 1200, 630);
    assert.equal(crop.sw, 1000);
    assert.equal(Math.round(crop.sh), 525);
    assert.equal(Math.round(crop.sy), Math.round((2000 - 525) / 2));
  });
});

describe('shareImagePath', () => {
  it('writes under {listingId}/browser/, the only prefix the browser may write (0023)', () => {
    const path = shareImagePath('8c1f2a7e-0000-4000-8000-000000000001', 'card', 'T4V7A', '0a1b2c3d', 'webp');
    assert.equal(path, '8c1f2a7e-0000-4000-8000-000000000001/browser/card-T4V7A-0a1b2c3d.webp');
    assert.equal(path.split('/')[1], 'browser');
  });

  it('puts the content key in the filename, never a query string (CLAUDE.md §6)', () => {
    const path = shareImagePath('id', 'story', 'T4V7A', '0a1b2c3d', 'jpg');
    assert.ok(!path.includes('?'));
    assert.ok(path.endsWith('-0a1b2c3d.jpg'));
  });

  it('cannot be steered out of the prefix', () => {
    const path = shareImagePath('id', 'card', '../../og/x', 'k?v=2', 'webp');
    assert.equal(path, 'id/browser/card-ogx-kv2.webp');
  });
});
