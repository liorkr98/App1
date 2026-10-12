import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FILM_FADE_SEC,
  FILM_MAX,
  FILM_PAN_TRAVEL,
  FILM_PAN_ZOOM,
  FILM_STILL_SEC,
  filmClock,
  filmContain,
  filmDuration,
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

  it('caps at eight and ignores an empty or negative count', () => {
    assert.equal(filmFrames(0).length, 0);
    assert.equal(filmFrames(-3).length, 0);
    assert.equal(filmFrames(40).length, FILM_MAX);
  });

  it('keeps the fade at a quarter of a still, which the CSS keyframes assume', () => {
    assert.equal(FILM_FADE_SEC / FILM_STILL_SEC, 0.25);
  });
});

describe('filmDuration', () => {
  it('matches the ffmpeg overlap: six stills land under twenty-five seconds', () => {
    assert.equal(filmDuration(6), 6 * FILM_STILL_SEC - 5 * FILM_FADE_SEC);
    assert.ok(filmDuration(6) < 25);
    assert.ok(filmDuration(8) < 60);
    assert.equal(filmDuration(0), 0);
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
  it('never zooms past 4% on a push or pull, nor 5% on a pan', () => {
    for (let step = 0; step <= 20; step += 1) {
      const p = step / 20;
      assert.ok(filmPose('in', p).scale <= 1.04 + 1e-9);
      assert.ok(filmPose('out', p).scale <= 1.04 + 1e-9);
      assert.ok(filmPose('panRight', p).scale <= 1.05 + 1e-9);
    }
  });

  it('moves no faster than about 1% a second', () => {
    assert.ok((filmPose('in', 1).scale - 1) / FILM_STILL_SEC <= 0.01);
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
