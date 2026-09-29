import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  checkPixels,
  differenceHash,
  hammingHex,
  laplacianVariance,
  photoFlags,
  suggestedOrder,
  type PhotoCheck,
} from './photo-quality.js';

const W = 64;
const H = 48;

/** RGBA for a function of (x, y) → gray. */
function image(fn: (x: number, y: number) => number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = Math.max(0, Math.min(255, fn(x, y)));
      out.set([v, v, v, 255], (y * W + x) * 4);
    }
  }
  return out;
}

const checker = image((x, y) => (((x >> 2) + (y >> 2)) % 2 ? 230 : 40));
const smooth = image((x) => 60 + x * 2);
const night = image((x, y) => (((x >> 2) + (y >> 2)) % 2 ? 40 : 10));
const big = { width: 4000, height: 3000 };

describe('photo quality', () => {
  it('finds edges in a sharp frame and almost none in a smooth one', () => {
    const sharp = checkPixels(checker, W, H, big);
    const soft = checkPixels(smooth, W, H, big);
    assert.ok(sharp.sharpness > 1000, String(sharp.sharpness));
    assert.ok(soft.sharpness < 5, String(soft.sharpness));
    assert.deepEqual(photoFlags(sharp), []);
    assert.deepEqual(photoFlags(soft), ['blurry']);
  });

  it('flags a dark frame and a small original', () => {
    assert.ok(photoFlags(checkPixels(night, W, H, big)).includes('dark'));
    assert.ok(photoFlags(checkPixels(checker, W, H, { width: 800, height: 600 })).includes('small'));
  });

  it('sees the same shot taken twice, and not two different ones', () => {
    const a = differenceHash(checkerGray(), W, H);
    assert.equal(a, checkPixels(checker, W, H, big).hash);
    const brighter = image((x, y) => (((x >> 2) + (y >> 2)) % 2 ? 245 : 55));
    const b = checkPixels(brighter, W, H, big).hash;
    assert.ok(hammingHex(a, b) <= 6);
    const other = checkPixels(smooth, W, H, big);
    assert.ok(photoFlags(other, [a]).includes('duplicate') === false);
    assert.ok(photoFlags(checkPixels(brighter, W, H, big), [a]).includes('duplicate'));
  });

  it('measures nothing on a frame too small to have an interior', () => {
    assert.equal(laplacianVariance([1, 2, 3, 4], 2, 2), 0);
  });
});

function checkerGray(): number[] {
  const out: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out.push(((x >> 2) + (y >> 2)) % 2 ? 230 : 40);
  return out;
}

describe('suggestedOrder', () => {
  const good: PhotoCheck = { mean: 140, sharpness: 800, hash: '0', shortEdge: 3000, landscape: true };
  const portrait: PhotoCheck = { ...good, landscape: false };
  const dark: PhotoCheck = { ...good, mean: 20 };

  it('puts the best cover first, then the walk, unnamed last', () => {
    const order = suggestedOrder([
      { id: 'bath', room: 'bathroom' as const, check: good },
      { id: 'mystery', check: good },
      { id: 'kitchen', room: 'kitchen' as const, check: portrait },
      { id: 'living', room: 'living' as const, check: good },
      { id: 'night', room: 'bedroom' as const, check: dark },
    ]);
    assert.deepEqual(order.map((item) => item.id), ['living', 'kitchen', 'night', 'bath', 'mystery']);
  });

  it('keeps the agent’s order where it has no opinion', () => {
    const order = suggestedOrder([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    assert.deepEqual(order.map((item) => item.id), ['a', 'b', 'c']);
  });
});
