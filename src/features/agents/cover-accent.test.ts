import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { coverAccent, hueOf, nearestAccent } from './cover-accent.js';

type Rgb = [number, number, number];

/** A width × height frame, `share` of it `color` and the rest `ground`. */
function frame(color: Rgb, share = 1, ground: Rgb = [240, 238, 232], width = 40, height = 30): Uint8ClampedArray {
  const pixels = width * height;
  const out = new Uint8ClampedArray(pixels * 4);
  for (let index = 0; index < pixels; index += 1) {
    const [r, g, b] = index < pixels * share ? color : ground;
    out.set([r, g, b, 255], index * 4);
  }
  return out;
}

describe('hueOf', () => {
  it('puts the primaries where a colour wheel does', () => {
    assert.equal(Math.round(hueOf(255, 0, 0).hue), 0);
    assert.equal(Math.round(hueOf(0, 255, 0).hue), 120);
    assert.equal(Math.round(hueOf(0, 0, 255).hue), 240);
    assert.equal(hueOf(128, 128, 128).chroma, 0);
  });
});

describe('nearestAccent', () => {
  it('maps a hue to the offered accent nearest it', () => {
    assert.equal(nearestAccent(20), 'clay');
    assert.equal(nearestAccent(45), 'ochre');
    assert.equal(nearestAccent(90), 'olive');
    assert.equal(nearestAccent(150), 'forest');
    assert.equal(nearestAccent(340), 'wine');
  });
});

describe('coverAccent', () => {
  it('follows the strongest colour in the photograph', () => {
    assert.equal(coverAccent(frame([160, 82, 45]), 40, 30), 'clay'); // brick
    assert.equal(coverAccent(frame([46, 139, 87]), 40, 30), 'forest'); // foliage
    assert.equal(coverAccent(frame([128, 30, 60]), 40, 30), 'wine'); // a wine sofa
    assert.equal(coverAccent(frame([200, 150, 40]), 40, 30), 'ochre'); // oak and brass
  });

  it('lets one saturated object outweigh a pale room', () => {
    // A white room with a wine-red sofa across a fifth of the frame.
    assert.equal(coverAccent(frame([128, 30, 60], 0.2), 40, 30), 'wine');
  });

  it('suggests nothing for white walls and grey floors', () => {
    assert.equal(coverAccent(frame([236, 234, 228]), 40, 30), undefined);
    assert.equal(coverAccent(frame([120, 120, 118]), 40, 30), undefined);
  });

  it('never turns the sky into a colour', () => {
    // Blue is not an accent (accents.ts), and a balcony shot is mostly sky.
    assert.equal(coverAccent(frame([135, 206, 235]), 40, 30), undefined);
    assert.equal(coverAccent(frame([30, 80, 200]), 40, 30), undefined);
    // Sky with a terracotta roof: the roof, not the sky.
    assert.equal(coverAccent(frame([170, 80, 50], 0.3, [135, 206, 235]), 40, 30), 'clay');
  });

  it('never suggests charcoal, and survives an empty frame', () => {
    assert.equal(coverAccent(new Uint8ClampedArray(0), 0, 0), undefined);
  });
});
