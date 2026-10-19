import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FILM_BITS_PER_SECOND, pickRecorderType, RECORDER_TYPES, RECORDER_TYPES_WITH_SOUND } from './film-format.js';
import { FILM_MOODS, isFilmMood, musicLevel, musicScore, MUSIC_FADE_OUT_SEC } from './film-music.js';
import { FILM_FORMATS, isFilmFormat } from './film-overlay.js';

describe('musicScore — the film music, generated (18 Oct 2026)', () => {
  it('is the same notes for the same mood and length', () => {
    for (const mood of FILM_MOODS) assert.deepEqual(musicScore(mood, 21.4), musicScore(mood, 21.4));
  });

  it('ends every note inside the film', () => {
    for (const mood of FILM_MOODS) {
      for (const seconds of [6, 13.37, 30]) {
        const notes = musicScore(mood, seconds);
        assert.ok(notes.length > 0, mood);
        for (const note of notes) {
          assert.ok(note.at >= 0 && note.length > 0, `${mood} ${note.at}`);
          assert.ok(note.at + note.length <= seconds + 1e-9, `${mood} ${note.at}+${note.length} > ${seconds}`);
        }
      }
    }
  });

  it('stays in a range a phone speaker plays and an ear finds calm', () => {
    for (const mood of FILM_MOODS) {
      for (const note of musicScore(mood, 20)) {
        assert.ok(note.frequency >= 40 && note.frequency <= 2000, `${mood} ${note.frequency} Hz`);
        assert.ok(note.gain > 0 && note.gain <= 0.4, `${mood} gain ${note.gain}`);
      }
    }
  });

  it('is nothing for a film of no length', () => {
    assert.deepEqual(musicScore('calm', 0), []);
    assert.deepEqual(musicScore('warm', Number.NaN), []);
  });

  it('fades in, holds, and is silent at the last frame', () => {
    assert.equal(musicLevel(0, 20), 0);
    assert.equal(musicLevel(10, 20), 1);
    assert.ok(musicLevel(20 - MUSIC_FADE_OUT_SEC / 2, 20) < 1);
    assert.equal(musicLevel(20, 20), 0);
  });

  it('knows its moods', () => {
    assert.ok(isFilmMood('calm'));
    assert.ok(!isFilmMood('loud'));
  });
});

describe('the recorder with sound', () => {
  it('asks for H.264 with AAC first, and only names types that carry sound or leave it to Safari', () => {
    assert.match(RECORDER_TYPES_WITH_SOUND[0]!.mime, /avc1.*mp4a/);
    for (const choice of RECORDER_TYPES_WITH_SOUND) {
      assert.ok(/mp4a|opus/.test(choice.mime) || choice.mime === 'video/mp4', choice.mime);
    }
  });

  it('falls back to a silent type when nothing records sound', () => {
    const silentOnly = (mime: string) => !/mp4a|opus/.test(mime) && mime !== 'video/mp4';
    assert.equal(pickRecorderType(silentOnly, RECORDER_TYPES_WITH_SOUND), undefined);
    assert.equal(pickRecorderType(silentOnly, RECORDER_TYPES)?.mime, 'video/mp4;codecs=avc1.4d002a');
    assert.ok(FILM_BITS_PER_SECOND > 0);
  });
});

describe('FILM_FORMATS — story, feed and square', () => {
  it('is 9:16, 4:5 and 1:1 at the same width', () => {
    assert.deepEqual(
      Object.values(FILM_FORMATS).map((frame) => [frame.width, frame.height]),
      [
        [1080, 1920],
        [1080, 1350],
        [1080, 1080],
      ],
    );
  });

  it('leaves room inside every frame for the words', () => {
    for (const [name, frame] of Object.entries(FILM_FORMATS)) {
      // The opening words need about 520 px below the top margin (film-file.ts drawHook).
      assert.ok(frame.safe.top + 520 < frame.height - frame.safe.bottom, name);
      assert.ok(frame.safe.side * 2 < frame.width, name);
    }
    assert.ok(isFilmFormat('square'));
    assert.ok(!isFilmFormat('landscape'));
  });
});
