import { musicLevel, musicScore, MUSIC_FADE_IN_SEC, MUSIC_FADE_OUT_SEC, type FilmMood, type MusicNote } from '@/features/listings/film-music';

/**
 * Plays the film's score (film-music.ts) into a stream the recorder mixes
 * with the canvas (18 Oct 2026). Oscillators and envelopes only: no file, no
 * library. The editor makes the AudioContext inside the button's tap, since
 * iOS refuses one made later; this only schedules the notes on it.
 */

const SHAPE: Record<MusicNote['voice'], { type: OscillatorType; attack: number; release: number; detune: number }> = {
  pad: { type: 'triangle', attack: 0.6, release: 0.8, detune: 6 },
  bass: { type: 'sine', attack: 0.02, release: 0.3, detune: 0 },
  pluck: { type: 'triangle', attack: 0.005, release: 0.25, detune: 0 },
};

export interface FilmMusic {
  track: MediaStreamTrack;
  /** Schedules every note from now; call when the recorder starts. */
  start: () => void;
  stop: () => void;
}

export function filmMusic(context: AudioContext, mood: FilmMood, seconds: number): FilmMusic | undefined {
  if (typeof context.createMediaStreamDestination !== 'function') return undefined;
  const destination = context.createMediaStreamDestination();
  const track = destination.stream.getAudioTracks()[0];
  if (!track) return undefined;

  const master = context.createGain();
  master.gain.value = 0;
  // Takes the edge off triangle waves; the music sits under the pictures.
  const soften = context.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 2600;
  master.connect(soften).connect(destination);

  const sources: OscillatorNode[] = [];
  const start = () => {
    const t0 = context.currentTime + 0.05;
    // The master fade, the same curve musicLevel describes.
    master.gain.setValueAtTime(0, t0);
    master.gain.linearRampToValueAtTime(musicLevel(MUSIC_FADE_IN_SEC, seconds), t0 + MUSIC_FADE_IN_SEC);
    master.gain.setValueAtTime(musicLevel(seconds - MUSIC_FADE_OUT_SEC, seconds), t0 + Math.max(MUSIC_FADE_IN_SEC, seconds - MUSIC_FADE_OUT_SEC));
    master.gain.linearRampToValueAtTime(0, t0 + seconds);

    for (const note of musicScore(mood, seconds)) {
      const shape = SHAPE[note.voice];
      const begin = t0 + note.at;
      const end = begin + note.length;
      const attack = Math.min(shape.attack, note.length / 2);
      const release = Math.min(shape.release, note.length - attack);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0, begin);
      envelope.gain.linearRampToValueAtTime(note.gain, begin + attack);
      if (note.voice === 'pluck') {
        envelope.gain.exponentialRampToValueAtTime(0.0001, end);
      } else {
        envelope.gain.setValueAtTime(note.gain, end - release);
        envelope.gain.linearRampToValueAtTime(0, end);
      }
      envelope.connect(master);
      for (const detune of shape.detune ? [-shape.detune, shape.detune] : [0]) {
        const oscillator = context.createOscillator();
        oscillator.type = shape.type;
        oscillator.frequency.value = note.frequency;
        oscillator.detune.value = detune;
        oscillator.connect(envelope);
        oscillator.start(begin);
        oscillator.stop(end + 0.05);
        sources.push(oscillator);
      }
    }
  };
  const stop = () => {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
    track.stop();
  };
  return { track, start, stop };
}
