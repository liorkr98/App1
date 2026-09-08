import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_FRAME_COUNT,
  gridFor,
  monotonic,
  resampleByAngle,
  resampleByTime,
  SweepTooShort,
  unwrap,
  type HeadingSample,
} from './angles.js';

/**
 * These run on the pure maths only. The ffmpeg and sharp halves of D3 need a
 * real video file and a real libvips, so they are exercised by running the
 * pipeline, not here — see the honesty note in docs/PIPELINE.md about what CI
 * does and does not prove.
 */

/** A perfectly even walk-around: heading advances 10 degrees per second. */
function evenWalk(seconds = 36): HeadingSample[] {
  return Array.from({ length: seconds + 1 }, (_, i) => ({
    t: i,
    yaw: ((i * 10 + 180) % 360) - 180,
  }));
}

describe('unwrap', () => {
  it('removes the wrap so the track is continuous', () => {
    const track = unwrap([
      { t: 0, yaw: 170 },
      { t: 1, yaw: -175 },
      { t: 2, yaw: -160 },
    ]);

    assert.deepEqual(track, [170, 185, 200]);
  });

  it('leaves an unwrapped track alone', () => {
    assert.deepEqual(unwrap([
      { t: 0, yaw: 0 },
      { t: 1, yaw: 10 },
      { t: 2, yaw: 20 },
    ]), [0, 10, 20]);
  });
});

describe('monotonic', () => {
  it('clamps backward jitter without moving the real motion', () => {
    const { track, reversed } = monotonic([0, 10, 8, 20, 19, 30]);

    assert.equal(reversed, false);
    assert.deepEqual(track, [0, 10, 10, 20, 20, 30]);
  });

  it('orients a counter-clockwise walk so the track still ascends', () => {
    const { track, reversed } = monotonic([0, -10, -20, -30]);

    assert.equal(reversed, true);
    assert.deepEqual(track, [0, 10, 20, 30]);
  });
});

describe('resampleByAngle', () => {
  it('spaces frames evenly in angle for an even walk', () => {
    const { timestamps, sweepDegrees, reversed } = resampleByAngle(evenWalk());

    assert.equal(timestamps.length, DEFAULT_FRAME_COUNT);
    assert.equal(reversed, false);
    assert.equal(Math.round(sweepDegrees), 360);

    // 360 degrees over 36 frames at 10 deg/s is one frame per second.
    timestamps.forEach((t, frame) => {
      assert.ok(Math.abs(t - frame) < 1e-6, `frame ${frame} at ${t}`);
    });
  });

  it('compensates for a pause, which is the whole point', () => {
    // Ten seconds of walking, ten seconds standing still, then the rest.
    // Uniform TIME sampling would spend a quarter of the frames on the pause.
    const samples: HeadingSample[] = [
      { t: 0, yaw: 0 },
      { t: 10, yaw: 100 },
      { t: 20, yaw: 100 },
      { t: 30, yaw: -160 }, // crosses the wrap; unwraps to 200
      { t: 40, yaw: -60 }, //  300
      { t: 46, yaw: 0 }, //    360
    ];

    const { timestamps } = resampleByAngle(unwrapFriendly(samples));

    assert.equal(timestamps.length, DEFAULT_FRAME_COUNT);

    // Strictly ascending, and no run of frames stuck inside the pause.
    for (let i = 1; i < timestamps.length; i += 1) {
      assert.ok((timestamps[i] ?? 0) >= (timestamps[i - 1] ?? 0), `frame ${i} went backwards`);
    }

    const insidePause = timestamps.filter((t) => t > 10 && t < 20).length;
    assert.ok(insidePause <= 1, `${insidePause} frames landed inside the pause`);
  });

  it('refuses a sweep that never went round the vehicle', () => {
    const half: HeadingSample[] = [
      { t: 0, yaw: 0 },
      { t: 5, yaw: 90 },
      { t: 10, yaw: 180 },
    ];

    assert.throws(() => resampleByAngle(half), SweepTooShort);
  });

  it('refuses a track with nothing to interpolate', () => {
    assert.throws(() => resampleByAngle([{ t: 0, yaw: 0 }]), SweepTooShort);
  });
});

describe('resampleByTime', () => {
  it('divides the duration evenly', () => {
    const timestamps = resampleByTime(36);

    assert.equal(timestamps.length, DEFAULT_FRAME_COUNT);
    assert.equal(timestamps[0], 0);
    assert.equal(timestamps[18], 18);
  });
});

describe('gridFor', () => {
  /**
   * The other half of this contract lives in web/src/lib/viewers/spin.ts. If
   * that file's gridFor ever changes, this test still passes and the spin
   * silently shows the wrong frame — so the numbers are asserted literally
   * here rather than derived, to make the mismatch visible in a diff.
   */
  it('lays 36 frames out on a 6x6 sheet', () => {
    assert.deepEqual(gridFor(36), { columns: 6, rows: 6 });
  });

  it('fills row-major and leaves the remainder in the last row', () => {
    assert.deepEqual(gridFor(24), { columns: 5, rows: 5 });
    assert.deepEqual(gridFor(12), { columns: 4, rows: 3 });
  });
});

/** Fills in intermediate samples so the fixture reads as a real track. */
function unwrapFriendly(sparse: HeadingSample[]): HeadingSample[] {
  const out: HeadingSample[] = [];

  for (let i = 0; i < sparse.length - 1; i += 1) {
    const a = sparse[i];
    const b = sparse[i + 1];
    if (!a || !b) continue;

    const steps = Math.max(Math.round(b.t - a.t), 1);
    for (let step = 0; step < steps; step += 1) {
      const fraction = step / steps;
      const delta = ((b.yaw - a.yaw + 540) % 360) - 180;
      out.push({ t: a.t + (b.t - a.t) * fraction, yaw: a.yaw + delta * fraction });
    }
  }

  const last = sparse[sparse.length - 1];
  if (last) out.push(last);

  return out;
}
