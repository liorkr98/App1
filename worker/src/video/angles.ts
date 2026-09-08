/**
 * Angular resampling for the 36-frame spin (D3).
 *
 * The seller walks around the car holding their phone. They do not walk at a
 * constant speed — they slow down at the corners, stop to step over a kerb,
 * and speed up along the flat side. Sampling 36 frames at equal TIME intervals
 * therefore produces frames at unequal ANGLES, and the spin stutters: three
 * frames of the same door, then a jump across the whole bonnet.
 *
 * So we resample by angle instead. The capture flow records the device heading
 * while filming; this module inverts that heading-versus-time curve to find
 * the timestamp at which the camera was at each of the 36 target angles.
 *
 * Dependency-free on purpose — this is the part worth unit-testing, and it
 * should not need ffmpeg to run.
 */

/** One heading sample from the capture flow. */
export interface HeadingSample {
  /** Seconds from the start of the video. */
  t: number;
  /** Device heading in degrees. Wrapping is expected and handled. */
  yaw: number;
}

export const DEFAULT_FRAME_COUNT = 36;

/**
 * A sweep shorter than this is not a walk-around.
 *
 * Not 360: a seller who stops a few degrees short of where they started has
 * still captured the car, and rejecting that would be pedantic. Below about
 * 330 degrees there is a visible wedge of the vehicle that simply was never
 * filmed, and a spin with a missing wedge is worse than no spin.
 */
export const MIN_SWEEP_DEGREES = 330;

/**
 * Removes the +-180 wrap so the track becomes a continuous cumulative angle.
 *
 * A heading track crosses the wrap point once per revolution. Left wrapped,
 * the curve jumps by 360 there and every interpolation across the jump lands
 * on the far side of the car.
 */
export function unwrap(samples: readonly HeadingSample[]): number[] {
  const out: number[] = [];
  let offset = 0;
  let previous: number | undefined;

  for (const sample of samples) {
    if (previous !== undefined) {
      let delta = sample.yaw - previous;
      // Any single step larger than half a turn is a wrap, not motion: at a
      // realistic sampling rate nobody rotates 180 degrees between samples.
      while (delta > 180) {
        offset -= 360;
        delta -= 360;
      }
      while (delta < -180) {
        offset += 360;
        delta += 360;
      }
    }
    previous = sample.yaw;
    out.push(sample.yaw + offset);
  }

  return out;
}

/**
 * Orients a track so it increases, then clamps out backward jitter.
 *
 * Heading sensors jitter and a walking human sways. Both put small backward
 * steps into an otherwise forward sweep, and a non-monotonic curve cannot be
 * inverted — two timestamps would claim the same angle. Clamping to the
 * running maximum discards the jitter and keeps the real motion.
 *
 * The returned track always ascends and stays paired with the ORIGINAL,
 * ascending timestamps. `reversed` only records which way round the vehicle
 * the seller actually walked.
 */
export function monotonic(unwrapped: readonly number[]): {
  track: number[];
  reversed: boolean;
} {
  const first = unwrapped[0] ?? 0;
  const last = unwrapped[unwrapped.length - 1] ?? 0;
  const reversed = last < first;
  const sign = reversed ? -1 : 1;

  const track: number[] = [];
  let running = -Infinity;

  for (const value of unwrapped) {
    // `-1 * 0` is -0, and -0 is not the same VALUE as 0 even though it
    // compares equal with ===. A track of angles that sometimes starts at -0
    // and sometimes at 0 depending on which way the seller walked is a wart:
    // it survives into job results and into anything that compares them
    // strictly.
    const oriented = value === 0 ? 0 : sign * value;
    running = Math.max(running, oriented);
    track.push(running);
  }

  return { track, reversed };
}

export interface ResampleResult {
  /** Timestamps in seconds, one per output frame, ascending. */
  timestamps: number[];
  /** Total angle swept, in degrees. */
  sweepDegrees: number;
  /** True when the seller walked the other way round the vehicle. */
  reversed: boolean;
}

export class SweepTooShort extends Error {
  constructor(readonly sweepDegrees: number) {
    super(
      `sweep of ${sweepDegrees.toFixed(1)} degrees is below the ${MIN_SWEEP_DEGREES} minimum`,
    );
    this.name = 'SweepTooShort';
  }
}

/**
 * Timestamps at which the camera stood at each of `frameCount` equal angles.
 *
 * Linear interpolation between heading samples is enough: the capture flow
 * samples far faster than a person can walk, so between two samples the motion
 * really is close to linear. Anything fancier would be fitting noise.
 */
export function resampleByAngle(
  samples: readonly HeadingSample[],
  frameCount = DEFAULT_FRAME_COUNT,
): ResampleResult {
  if (samples.length < 2) {
    throw new SweepTooShort(0);
  }

  const { track, reversed } = monotonic(unwrap(samples));
  const times = samples.map((sample) => sample.t);

  const start = track[0] ?? 0;
  const sweepDegrees = (track[track.length - 1] ?? 0) - start;

  if (sweepDegrees < MIN_SWEEP_DEGREES) {
    throw new SweepTooShort(sweepDegrees);
  }

  const timestamps: number[] = [];
  let cursor = 0;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const target = start + (sweepDegrees * frame) / frameCount;

    // Targets ascend, so the search never restarts from the beginning.
    while (cursor < track.length - 2 && (track[cursor + 1] ?? 0) < target) {
      cursor += 1;
    }

    const a = track[cursor] ?? 0;
    const b = track[cursor + 1] ?? a;
    const ta = times[cursor] ?? 0;
    const tb = times[cursor + 1] ?? ta;

    // A flat span means the walker paused. Every timestamp inside it shows the
    // same angle, so the start of the span is as good as any.
    const fraction = b === a ? 0 : (target - a) / (b - a);
    timestamps.push(ta + (tb - ta) * Math.min(Math.max(fraction, 0), 1));
  }

  return { timestamps, sweepDegrees, reversed };
}

/**
 * Even sampling across a duration, used when no heading track was recorded.
 *
 * The honest fallback, not a substitute. Callers report which of the two ran
 * so nobody reads a stuttering spin as a rendering bug.
 */
export function resampleByTime(durationSeconds: number, frameCount = DEFAULT_FRAME_COUNT): number[] {
  return Array.from({ length: frameCount }, (_, frame) => (durationSeconds * frame) / frameCount);
}

/**
 * Sprite sheet layout. MUST match web/src/lib/viewers/spin.ts gridFor().
 *
 * If these two disagree the sheet still loads and the spin still drags — it
 * just shows the wrong frame, which looks like a jumbled car rather than a
 * broken build. Duplicated deliberately rather than shared: the worker and the
 * web bundle have no common module, and a wrong copy is caught by the test
 * below it.
 */
export function gridFor(frameCount: number): { columns: number; rows: number } {
  const columns = Math.ceil(Math.sqrt(frameCount));
  return { columns, rows: Math.ceil(frameCount / columns) };
}
