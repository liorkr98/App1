/**
 * Which recording the browser makes of the story film (13 Oct 2026).
 *
 * WhatsApp and every iPhone play H.264 in MP4. Chrome records H.264 only
 * when asked for `avc1` by name: a bare `video/mp4` came out VP9 inside an
 * .mp4 that was labelled h264, which an iPhone may refuse. So H.264 is asked
 * for by name, then WebM (honestly labelled), and a bare `video/mp4` only
 * last — that is Safari, whose MP4 is always H.264.
 */
export interface RecorderChoice {
  mime: string;
  codec: 'h264' | 'vp9' | 'vp8';
  extension: 'mp4' | 'webm';
}

export const RECORDER_TYPES: readonly RecorderChoice[] = [
  { mime: 'video/mp4;codecs=avc1.4d002a', codec: 'h264', extension: 'mp4' },
  { mime: 'video/mp4;codecs=avc1.42e01f', codec: 'h264', extension: 'mp4' },
  { mime: 'video/mp4;codecs=avc1', codec: 'h264', extension: 'mp4' },
  { mime: 'video/webm;codecs=vp9', codec: 'vp9', extension: 'webm' },
  { mime: 'video/webm;codecs=vp8', codec: 'vp8', extension: 'webm' },
  { mime: 'video/webm', codec: 'vp8', extension: 'webm' },
  { mime: 'video/mp4', codec: 'h264', extension: 'mp4' },
];

/**
 * The same order with the sound named (18 Oct 2026), for a film with music:
 * AAC beside H.264, which is what an iPhone and WhatsApp play, then Opus in
 * WebM. A bare `video/mp4` stays last; Safari adds AAC to it by itself.
 * When none is supported the film records silent, and the editor says so.
 */
export const RECORDER_TYPES_WITH_SOUND: readonly RecorderChoice[] = [
  { mime: 'video/mp4;codecs=avc1.4d002a,mp4a.40.2', codec: 'h264', extension: 'mp4' },
  { mime: 'video/mp4;codecs=avc1.42e01f,mp4a.40.2', codec: 'h264', extension: 'mp4' },
  { mime: 'video/mp4;codecs=avc1,mp4a.40.2', codec: 'h264', extension: 'mp4' },
  { mime: 'video/webm;codecs=vp9,opus', codec: 'vp9', extension: 'webm' },
  { mime: 'video/webm;codecs=vp8,opus', codec: 'vp8', extension: 'webm' },
  { mime: 'video/mp4', codec: 'h264', extension: 'mp4' },
];

export const FILM_AUDIO_BITS_PER_SECOND = 128_000;

/**
 * About 4 Mbit/s: thirty seconds of 1080 × 1920 stays under the 16 MB a
 * WhatsApp status accepts, with room for a slow phone's bursts.
 */
export const FILM_BITS_PER_SECOND = 4_000_000;

export function pickRecorderType(
  isSupported: (mime: string) => boolean,
  types: readonly RecorderChoice[] = RECORDER_TYPES,
): RecorderChoice | undefined {
  return types.find((choice) => {
    try {
      return isSupported(choice.mime);
    } catch {
      return false;
    }
  });
}
