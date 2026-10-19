import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyTone, toneFor } from './photo-tone.js';

/** A 40 × 40 sample: a gradient from `from` to `to`, tinted by `tint`. */
function sample(from: number, to: number, tint: [number, number, number] = [1, 1, 1]): Uint8ClampedArray {
  const size = 40;
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    const level = from + ((to - from) * i) / (size * size - 1);
    rgba[i * 4] = level * tint[0];
    rgba[i * 4 + 1] = level * tint[1];
    rgba[i * 4 + 2] = level * tint[2];
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

const meanOf = (rgba: Uint8ClampedArray, channel: number) => {
  let sum = 0;
  for (let i = channel; i < rgba.length; i += 4) sum += rgba[i]!;
  return sum / (rgba.length / 4);
};

describe('toneFor — the automatic photo fix (19 Oct 2026)', () => {
  it('lifts a dark photo and takes the yellow out of it', () => {
    const dark = sample(5, 150, [1, 0.92, 0.75]);
    const tone = toneFor(dark, 40, 40);
    assert.ok(tone);
    const fixed = dark.slice();
    applyTone(fixed, tone);
    assert.ok(meanOf(fixed, 1) > meanOf(dark, 1) + 20, 'brighter');
    const castBefore = meanOf(dark, 0) - meanOf(dark, 2);
    const castAfter = meanOf(fixed, 0) - meanOf(fixed, 2);
    assert.ok(castAfter < castBefore * 0.7, 'less yellow');
  });

  it('leaves a well-exposed neutral photo alone', () => {
    assert.equal(toneFor(sample(0, 255), 40, 40), undefined);
  });

  it('never moves a colour by more than its cap, so warm light stays warm', () => {
    const tone = toneFor(sample(0, 255, [1, 0.6, 0.3]), 40, 40);
    assert.ok(tone);
    for (const gain of tone.gains) assert.ok(gain >= 0.9 && gain <= 1.12, String(gain));
  });

  it('keeps the order of light and dark: the curve only ever rises', () => {
    const tone = toneFor(sample(10, 120), 40, 40);
    assert.ok(tone);
    for (let level = 1; level < 256; level += 1) assert.ok(tone.lut[level]! >= tone.lut[level - 1]!);
  });

  it('has nothing to say about a sample too small to read', () => {
    assert.equal(toneFor(new Uint8ClampedArray(8), 1, 2), undefined);
  });
});
