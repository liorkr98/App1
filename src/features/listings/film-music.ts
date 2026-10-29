/**
 * The music under the story film (18 Oct 2026), written as notes here and
 * played by WebAudio in the agent's browser (web/src/lib/film-music.ts).
 *
 * Generated, not a recording, by the owner's choice: no file to host and no
 * licence to keep. Off unless the agent picks a mood. Kept apart from the
 * audio so the score can be tested: the same mood and length always make the
 * same notes, every note ends inside the film, and the sound is gone by the
 * last frame — a reel that stops mid-chord sounds broken.
 */

export type FilmMood = 'calm' | 'warm' | 'upbeat';

export const FILM_MOODS: readonly FilmMood[] = ['calm', 'warm', 'upbeat'];

export function isFilmMood(value: unknown): value is FilmMood {
  return typeof value === 'string' && (FILM_MOODS as readonly string[]).includes(value);
}

export type MusicVoice = 'pad' | 'bass' | 'pluck';

export interface MusicNote {
  /** Seconds from the start of the film. */
  at: number;
  length: number;
  frequency: number;
  voice: MusicVoice;
  /** 0–1, before the master fade. */
  gain: number;
}

export const MUSIC_FADE_IN_SEC = 1.5;
export const MUSIC_FADE_OUT_SEC = 2;

interface MoodSpec {
  bpm: number;
  /** Four chords, one bar of four beats each, as MIDI notes; the first is the bass. */
  chords: readonly (readonly number[])[];
  /** Plucked notes per beat: 0 none, 1 quarters, 2 eighths. */
  pluck: 0 | 1 | 2;
  /** The bass on every beat instead of once a bar. */
  walking: boolean;
}

const MOODS: Record<FilmMood, MoodSpec> = {
  // Cmaj7 – Am7 – Fmaj7 – G6: slow, open, nothing on the beat.
  calm: {
    bpm: 68,
    chords: [
      [48, 60, 64, 67, 71],
      [45, 60, 64, 67, 69],
      [41, 57, 60, 64, 65],
      [43, 59, 62, 64, 67],
    ],
    pluck: 0,
    walking: false,
  },
  // D – Bm – G – A, a soft arpeggio on the beat.
  warm: {
    bpm: 84,
    chords: [
      [50, 62, 66, 69],
      [47, 62, 66, 71],
      [43, 62, 67, 71],
      [45, 61, 64, 69],
    ],
    pluck: 1,
    walking: false,
  },
  // F – C – Dm – Bb, eighths and a bass on every beat.
  upbeat: {
    bpm: 108,
    chords: [
      [41, 60, 65, 69],
      [48, 60, 64, 67],
      [50, 62, 65, 69],
      [46, 62, 65, 70],
    ],
    pluck: 2,
    walking: true,
  },
};

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** The master level at `time`: up over the first 1.5 s, down to nothing at the end. */
export function musicLevel(time: number, seconds: number): number {
  if (time <= 0 || time >= seconds) return 0;
  const rise = Math.min(1, time / MUSIC_FADE_IN_SEC);
  const fall = Math.min(1, (seconds - time) / MUSIC_FADE_OUT_SEC);
  return Math.max(0, Math.min(rise, fall));
}

/** Every note of a film `seconds` long, in time order. */
export function musicScore(mood: FilmMood, seconds: number): MusicNote[] {
  if (!(seconds > 0)) return [];
  const spec = MOODS[mood];
  const beat = 60 / spec.bpm;
  const bar = beat * 4;
  const notes: MusicNote[] = [];
  const add = (at: number, length: number, midi: number, voice: MusicVoice, gain: number) => {
    const from = floor(at);
    if (from >= seconds) return;
    notes.push({
      at: from,
      length: floor(Math.min(length, seconds - from)),
      frequency: Math.round(midiToFrequency(midi) * 100) / 100,
      voice,
      gain,
    });
  };

  for (let index = 0; index * bar < seconds; index++) {
    const start = index * bar;
    const chord = spec.chords[index % spec.chords.length]!;
    const [root, ...upper] = chord;
    for (const midi of upper) add(start, bar, midi, 'pad', 0.16);
    if (spec.walking) {
      for (let b = 0; b < 4; b++) add(start + b * beat, beat * 0.9, root!, 'bass', 0.32);
    } else {
      add(start, bar, root!, 'bass', 0.28);
    }
    if (spec.pluck > 0) {
      const step = beat / spec.pluck;
      const count = 4 * spec.pluck;
      for (let n = 0; n < count; n++) {
        // Up the chord an octave above the pad, and back down.
        const order = n % (upper.length * 2 - 2 || 1);
        const pick = order < upper.length ? order : upper.length * 2 - 2 - order;
        add(start + n * step, step * 0.9, upper[pick]! + 12, 'pluck', n % spec.pluck === 0 ? 0.14 : 0.09);
      }
    }
  }
  return notes.sort((a, b) => a.at - b.at || a.frequency - b.frequency);
}

// To the millisecond, down, so a note never runs past the film by rounding.
const floor = (value: number) => Math.floor(value * 1000) / 1000;
