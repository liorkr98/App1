import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FILM_BITS_PER_SECOND, RECORDER_TYPES, pickRecorderType } from './film-format.js';
import {
  FILM_END_SEC,
  FILM_HOOK_SEC,
  FILM_SAFE,
  endCardAlpha,
  endCardStart,
  hookAlpha,
  roomCaptionAt,
  storyDuration,
} from './film-overlay.js';
import { FILM_MAX, filmDuration, filmFrames } from './ken-burns.js';

describe('pickRecorderType (13 Oct: the .mp4 was VP9)', () => {
  it('asks for H.264 by name before anything else', () => {
    const chrome = (mime: string) => mime !== 'video/mp4;codecs=avc1.4d002a';
    assert.equal(pickRecorderType(chrome)?.mime, 'video/mp4;codecs=avc1.42e01f');
    assert.equal(pickRecorderType(chrome)?.codec, 'h264');
  });

  it('prefers an honest WebM to a bare video/mp4 when H.264 is not offered', () => {
    const chromium = (mime: string) => mime.startsWith('video/webm') || mime === 'video/mp4';
    const choice = pickRecorderType(chromium);
    assert.equal(choice?.extension, 'webm');
    assert.equal(choice?.codec, 'vp9');
  });

  it('reaches a bare video/mp4 only where nothing else records (Safari: always H.264)', () => {
    assert.equal(pickRecorderType((mime) => mime === 'video/mp4')?.mime, 'video/mp4');
    assert.equal(RECORDER_TYPES.at(-1)?.mime, 'video/mp4');
  });

  it('gives up when the browser cannot record, or throws', () => {
    assert.equal(pickRecorderType(() => false), undefined);
    assert.equal(
      pickRecorderType(() => {
        throw new Error('no');
      }),
      undefined,
    );
  });

  it('keeps thirty seconds under the 16 MB a WhatsApp status takes', () => {
    assert.ok((FILM_BITS_PER_SECOND * 30) / 8 < 16 * 1024 * 1024);
  });
});

describe('the story file overlays', () => {
  it('keeps every word inside the area the apps leave clear', () => {
    assert.ok(FILM_SAFE.top >= 250);
    assert.ok(FILM_SAFE.bottom >= 340);
    assert.ok(FILM_SAFE.side >= 60);
  });

  it('shows the hook at the start and only there', () => {
    assert.equal(hookAlpha(0), 0);
    assert.equal(hookAlpha(1.5), 1);
    assert.equal(hookAlpha(FILM_HOOK_SEC + 0.01), 0);
  });

  it('names a room only for a labelled photograph, never during the hook', () => {
    const rooms = ['סלון', undefined, 'מטבח', 'מרפסת'];
    const frames = filmFrames(rooms.length);
    for (let time = 0; time < FILM_HOOK_SEC; time += 0.1) assert.equal(roomCaptionAt(time, rooms), undefined);
    const kitchen = frames[2]!;
    assert.equal(roomCaptionAt(kitchen.start + 1, rooms)?.index, 2);
    const unnamed = frames[1]!;
    assert.notEqual(roomCaptionAt(unnamed.start + 1.2, rooms)?.index, 1);
  });

  it('only ever names the photograph that is on screen (13 Oct: the living room on the kitchen)', () => {
    const rooms = ['סלון', 'מטבח', 'מרפסת', 'חדר רחצה', 'חדר שינה', 'שירותים'];
    const frames = filmFrames(rooms.length);
    for (let time = 0; time < filmDuration(rooms.length); time += 0.05) {
      const caption = roomCaptionAt(time, rooms);
      if (!caption) continue;
      const showing = frames.filter((frame) => frame.start <= time).at(-1);
      assert.equal(caption.index, showing?.index, `at ${time.toFixed(2)}s`);
    }
  });

  it('closes on the card and keeps a full reel inside thirty-three seconds', () => {
    const count = 6;
    assert.equal(endCardAlpha(endCardStart(count) - 0.1, count), 0);
    assert.equal(endCardAlpha(storyDuration(count, true), count), 1);
    assert.equal(storyDuration(count, false), filmDuration(count));
    assert.ok(storyDuration(FILM_MAX, true) <= 33);
    assert.ok(Math.abs(storyDuration(count, true) - endCardStart(count) - FILM_END_SEC) < 1e-9);
    assert.equal(storyDuration(2, true), 0);
  });
});
