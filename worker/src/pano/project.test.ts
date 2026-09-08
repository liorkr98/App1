import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyTranspose,
  directionTables,
  equatorialCoverage,
  equirectDirection,
  featherWeight,
  focalLength,
  projectToImage,
  rotationMatrix,
  sampleRgb,
  type Vec3,
} from './project.js';

/**
 * Sign conventions are the entire risk in this module, so most of what follows
 * asserts a direction rather than a number. A stitcher with a flipped axis
 * still produces a plausible-looking image — it is only wrong when you stand
 * in the room and compare, which is exactly the check nobody runs.
 */

const close = (actual: number, expected: number, tolerance = 1e-9): void => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
};

const closeVec = (actual: Vec3, expected: Vec3, tolerance = 1e-9): void => {
  actual.forEach((value, i) => close(value, expected[i] ?? 0, tolerance));
};

describe('rotationMatrix', () => {
  it('is the identity at rest', () => {
    // Elementwise, not deepEqual. Several entries come out as -0 — the pitch
    // term is negated, and `-Math.sin(0)` is -0 — and deepStrictEqual treats
    // -0 and 0 as different values. What this test means is "no rotation",
    // not "no negative zeros", so it compares numbers as numbers.
    const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];

    rotationMatrix({ yaw: 0, pitch: 0 }).forEach((value, index) => {
      close(value, identity[index] ?? 0, 1e-15);
    });
  });

  it('makes yaw equal longitude', () => {
    // Yaw +90 must look exactly where longitude +90 points. If the two
    // disagree the panorama comes out mirrored, and no single shot looks
    // wrong — only the order they land in does.
    const m = rotationMatrix({ yaw: 90, pitch: 0 });
    const looking: Vec3 = [m[2], m[5], m[8]];

    closeVec(looking, [1, 0, 0], 1e-12);
    closeVec(equirectDirection(3072 - 0.5, 1024 - 0.5, 4096, 2048), looking, 1e-12);
  });

  it('points positive pitch UP', () => {
    const m = rotationMatrix({ yaw: 0, pitch: 90 });
    // Third column: where the camera's own forward axis ends up in the world.
    closeVec([m[2], m[5], m[8]], [0, 1, 0], 1e-12);
  });

  it('is orthonormal, so the inverse really is the transpose', () => {
    const m = rotationMatrix({ yaw: 37, pitch: -12, roll: 5 });
    const d: Vec3 = [0.3, -0.5, 0.81];
    const roundTrip = applyTranspose(m, [
      m[0] * d[0] + m[1] * d[1] + m[2] * d[2],
      m[3] * d[0] + m[4] * d[1] + m[5] * d[2],
      m[6] * d[0] + m[7] * d[1] + m[8] * d[2],
    ]);

    closeVec(roundTrip, d, 1e-12);
  });
});

describe('equirectDirection', () => {
  it('puts the centre of the image on +Z', () => {
    closeVec(equirectDirection(2048 - 0.5, 1024 - 0.5, 4096, 2048), [0, 0, 1], 1e-12);
  });

  it('puts the top row at the zenith', () => {
    const [, y] = equirectDirection(0, 0, 4096, 2048);
    assert.ok(y > 0.999, `top row pointed at y=${y}, not the zenith`);
  });

  it('returns unit vectors', () => {
    for (const [u, v] of [[0, 0], [1000, 700], [4095, 2047]] as const) {
      const d = equirectDirection(u, v, 4096, 2048);
      close(Math.hypot(d[0], d[1], d[2]), 1, 1e-12);
    }
  });
});

describe('directionTables', () => {
  it('reproduces equirectDirection exactly', () => {
    const width = 128;
    const height = 64;
    const { sinLon, cosLon, sinLat, cosLat } = directionTables(width, height);

    for (const [u, v] of [[0, 0], [1, 33], [64, 32], [127, 63]] as const) {
      const fromTables: Vec3 = [
        (cosLat[v] ?? 0) * (sinLon[u] ?? 0),
        sinLat[v] ?? 0,
        (cosLat[v] ?? 0) * (cosLon[u] ?? 0),
      ];

      closeVec(fromTables, equirectDirection(u, v, width, height), 1e-15);
    }
  });
});

describe('projectToImage', () => {
  const focal = focalLength(1600, 68);

  it('puts the optical axis at the image centre', () => {
    const point = projectToImage([0, 0, 1], focal, 1600, 1200);
    assert.ok(point);
    close(point.x, 800);
    close(point.y, 600);
  });

  it('sends world-up to the TOP of the image', () => {
    const point = projectToImage([0, 0.3, 1], focal, 1600, 1200);
    assert.ok(point);
    assert.ok(point.y < 600, `world-up landed at y=${point.y}, below centre`);
  });

  it('drops everything behind the camera', () => {
    assert.equal(projectToImage([0, 0, -1], focal, 1600, 1200), null);
    assert.equal(projectToImage([1, 0, 0], focal, 1600, 1200), null);
  });

  it('drops rays outside the frame', () => {
    assert.equal(projectToImage([10, 0, 1], focal, 1600, 1200), null);
  });

  it('places the half-field-of-view ray at the frame edge', () => {
    // Half of a 68 degree lens is 34 degrees off-axis, which must land on the
    // last column — a wrong focal length silently crops or stretches every
    // shot, and the panorama only looks slightly off.
    const inside = projectToImage([Math.tan((33.9 * Math.PI) / 180), 0, 1], focal, 1600, 1200);
    assert.ok(inside);
    assert.ok(inside.x > 1590, `33.9 degrees landed at x=${inside.x}`);

    assert.equal(projectToImage([Math.tan((34.5 * Math.PI) / 180), 0, 1], focal, 1600, 1200), null);
  });
});

describe('featherWeight', () => {
  it('is full weight in the middle and near zero at the edge', () => {
    close(featherWeight({ x: 800, y: 600 }, 1600, 1200), 1);
    assert.ok(featherWeight({ x: 0, y: 600 }, 1600, 1200) < 0.01);
  });

  it('never returns zero, so a single-shot pixel still survives', () => {
    assert.ok(featherWeight({ x: 0, y: 0 }, 1600, 1200) > 0);
  });

  it('falls off monotonically toward the edge', () => {
    // The ramp only bites inside the outer quarter, so the samples have to
    // sit there: 600px from centre is still full weight by design.
    const middle = featherWeight({ x: 800, y: 600 }, 1600, 1200);
    const nearer = featherWeight({ x: 100, y: 600 }, 1600, 1200);
    const edge = featherWeight({ x: 20, y: 600 }, 1600, 1200);

    assert.ok(middle > nearer && nearer > edge, `${middle} ${nearer} ${edge}`);
  });
});

describe('sampleRgb', () => {
  it('interpolates between neighbours', () => {
    // 2x1 image: black then white.
    const pixels = new Uint8Array([0, 0, 0, 255, 255, 255]);
    const out = new Float64Array(3);

    sampleRgb(pixels, 2, 1, 0.5, 0, out);
    close(out[0] ?? 0, 127.5);
  });

  it('clamps at the right edge instead of wrapping to the next row', () => {
    const pixels = new Uint8Array([10, 10, 10, 20, 20, 20, 30, 30, 30, 40, 40, 40]);
    const out = new Float64Array(3);

    sampleRgb(pixels, 2, 2, 1.9, 0, out);
    close(out[0] ?? 0, 20);
  });
});

describe('equatorialCoverage', () => {
  it('reports nothing covered for an empty canvas', () => {
    assert.equal(equatorialCoverage(new Float32Array(64 * 32), 64, 32), 0);
  });

  it('ignores the poles, which a phone sweep never reaches', () => {
    const width = 64;
    const height = 32;
    const weights = new Float32Array(width * height);

    // Fill the middle third only — a realistic eye-level sweep.
    for (let v = 11; v < 21; v += 1) {
      for (let u = 0; u < width; u += 1) weights[v * width + u] = 1;
    }

    assert.equal(equatorialCoverage(weights, width, height), 1);
  });

  it('catches a gap where the seller stopped turning', () => {
    const width = 64;
    const height = 32;
    const weights = new Float32Array(width * height);

    for (let v = 11; v < 21; v += 1) {
      for (let u = 0; u < width / 2; u += 1) weights[v * width + u] = 1;
    }

    close(equatorialCoverage(weights, width, height), 0.5, 1e-9);
  });
});
