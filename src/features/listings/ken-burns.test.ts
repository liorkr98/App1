import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FILM_FADE_SEC,
  FILM_MAX,
  FILM_MAX_CROP,
  FILM_MIN,
  FILM_PAN_TRAVEL,
  FILM_PAN_ZOOM,
  FILM_STILL_SEC,
  filmClock,
  filmContain,
  filmDuration,
  filmFit,
  filmFrames,
  filmPose,
} from './ken-burns.js';

describe('filmFrames', () => {
  it('opens on a push-in and then walks the four motions', () => {
    const frames = filmFrames(5);
    assert.deepEqual(
      frames.map((frame) => frame.motion),
      ['in', 'out', 'panRight', 'panLeft', 'in'],
    );
    assert.equal(frames[0]?.start, 0);
    assert.equal(frames[1]?.start, FILM_STILL_SEC - FILM_FADE_SEC);
  });

  it('caps at ten and ignores an empty or negative count', () => {
    assert.equal(FILM_MAX, 10);
    assert.equal(filmFrames(0).length, 0);
    assert.equal(filmFrames(-3).length, 0);
    assert.equal(filmFrames(40).length, FILM_MAX);
  });

  it('makes no film from fewer than three photographs (13 Oct: one still is not a video)', () => {
    assert.equal(FILM_MIN, 3);
    assert.equal(filmFrames(1).length, 0);
    assert.equal(filmFrames(2).length, 0);
    assert.equal(filmFrames(3).length, 3);
  });

  it('paces like a listing reel: about 2.5–3 seconds a photograph', () => {
    const each = FILM_STILL_SEC - FILM_FADE_SEC;
    assert.ok(each >= 2.4 && each <= 3, `${each}s a photograph`);
    assert.ok(FILM_FADE_SEC < FILM_STILL_SEC / 2);
  });
});

describe('filmDuration', () => {
  it('matches the ffmpeg overlap and stays inside a 15–30 second reel', () => {
    assert.equal(filmDuration(6), 6 * FILM_STILL_SEC - 5 * FILM_FADE_SEC);
    assert.ok(filmDuration(FILM_MAX) <= 30);
    assert.ok(filmDuration(6) >= 15);
    assert.equal(filmDuration(0), 0);
    assert.equal(filmDuration(2), 0);
  });
});

describe('filmClock', () => {
  it('writes m:ss', () => {
    assert.equal(filmClock(0), '0:00');
    assert.equal(filmClock(42), '0:42');
    assert.equal(filmClock(75), '1:15');
  });
});

describe('filmPose', () => {
  it('opens a push and both pans on the framed crop', () => {
    for (const motion of ['in', 'panRight', 'panLeft'] as const) {
      assert.deepEqual(filmPose(motion, 0), { scale: 1, shift: 0 });
    }
  });

  it('pushes in, and pans to the physical right only after it has zoomed', () => {
    assert.ok(filmPose('in', 1).scale > 1);
    assert.equal(filmPose('panRight', 0.1).shift, 0);
    assert.ok(filmPose('panRight', 1).shift > 0);
    assert.ok(filmPose('panLeft', 1).shift < 0);
  });
});

describe('the film stays calm (12 Oct: "too much zoom")', () => {
  it('never zooms past 3% on a push or pull, nor 4% on a pan', () => {
    for (let step = 0; step <= 20; step += 1) {
      const p = step / 20;
      assert.ok(filmPose('in', p).scale <= 1.03 + 1e-9);
      assert.ok(filmPose('out', p).scale <= 1.03 + 1e-9);
      assert.ok(filmPose('panRight', p).scale <= 1.04 + 1e-9);
    }
  });

  it('moves no faster than about 1% a second', () => {
    assert.ok((filmPose('in', 1).scale - 1) / FILM_STILL_SEC <= 0.01);
  });

  it('eases: starts and stops at rest rather than with a jolt', () => {
    const start = filmPose('in', 0.05).scale - filmPose('in', 0).scale;
    const middle = filmPose('in', 0.55).scale - filmPose('in', 0.5).scale;
    assert.ok(start < middle / 2);
  });

  it('never pans further than the zoom leaves room for, so no edge shows', () => {
    // At scale 1+z the picture overhangs each side by z/2 of the width.
    assert.ok(FILM_PAN_TRAVEL <= FILM_PAN_ZOOM / 2);
    assert.ok(Math.abs(filmPose('panLeft', 1).shift) <= FILM_PAN_ZOOM / 2);
  });
});

describe('filmContain', () => {
  it('keeps the whole of a wide photo in a vertical film', () => {
    const fitted = filmContain({ width: 1600, height: 1200 }, { width: 1080, height: 1920 });
    assert.equal(fitted.width, 1080);
    assert.equal(fitted.height, 810);
  });

  it('keeps the whole of a tall photo too, and never exceeds the frame', () => {
    const fitted = filmContain({ width: 900, height: 2400 }, { width: 1080, height: 1920 });
    assert.equal(fitted.height, 1920);
    assert.ok(fitted.width <= 1080);
  });
});

describe('filmFit (13 Oct: fill when it fits)', () => {
  const frame = { width: 1080, height: 1920 };
  const lost = (fit: { width: number; height: number }) =>
    Math.max(1 - frame.width / fit.width, 1 - frame.height / fit.height);

  it('fills the frame with a tall photograph that loses little', () => {
    const fit = filmFit({ width: 900, height: 1200 }, frame);
    assert.ok(fit.width >= frame.width && fit.height >= frame.height);
    assert.ok(lost(fit) <= FILM_MAX_CROP + 1e-9);
  });

  it('draws a wide photograph as large as a 30% crop allows, never more', () => {
    const fit = filmFit({ width: 1600, height: 1200 }, frame);
    assert.ok(Math.abs(lost(fit) - FILM_MAX_CROP) < 1e-9);
    assert.ok(fit.height < frame.height);
    assert.ok(fit.height > filmContain({ width: 1600, height: 1200 }, frame).height);
  });
});
