import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { clampRect, mosaicCell, moveRect, PLATE_MIN, PLATE_START, resizeRect } from './plate-rect.js';

describe('the plate rectangle (19 Oct 2026)', () => {
  it('stays inside the photograph however far it is dragged', () => {
    assert.deepEqual(moveRect(PLATE_START, 5, 5), { ...PLATE_START, x: 1 - PLATE_START.w, y: 1 - PLATE_START.h });
    const left = moveRect(PLATE_START, -5, -5);
    assert.equal(left.x, 0);
    assert.equal(left.y, 0);
  });

  it('never shrinks below a plate, nor grows past the edge', () => {
    const small = resizeRect(PLATE_START, -1, -1);
    assert.equal(small.w, PLATE_MIN);
    assert.equal(small.h, PLATE_MIN);
    const big = resizeRect(PLATE_START, 5, 5);
    assert.ok(Math.abs(big.x + big.w - 1) < 1e-9);
    assert.ok(Math.abs(big.y + big.h - 1) < 1e-9);
  });

  it('turns nonsense into a rectangle in the photograph', () => {
    const rect = clampRect({ x: Number.NaN, y: -3, w: 9, h: Number.NaN });
    assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= 1 && rect.y + rect.h <= 1);
  });

  it('makes cells wider than a character: about eight across, at least 8 pixels', () => {
    assert.equal(mosaicCell(400), 50);
    assert.equal(mosaicCell(40), 8);
  });
});
