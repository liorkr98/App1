import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FILM_FADE_SEC, FILM_MAX, FILM_STILL_SEC, filmClock, filmDuration, filmFrames, filmPose } from './ken-burns.js';

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
  it('matches the ffmpeg overlap: six stills land near fifteen seconds', () => {
    assert.equal(filmDuration(6), 6 * 3.2 - 5 * 0.8);
    assert.ok(filmDuration(6) < 16);
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
