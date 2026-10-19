/**
 * The automatic fix for a phone photograph (19 Oct 2026): light, colour and
 * contrast, the way an agent would move three sliders. Nothing is drawn,
 * added or removed — no generative imagery (PRD), and a room never looks
 * like something it is not (CLAUDE.md §7).
 *
 *   white balance  gray-world, capped at 0.9–1.12 per channel, so a yellow
 *                  evening cast goes and warm light stays warm
 *   levels         the darkest and lightest half percent become black and
 *                  white, never stretching past lo 40 / hi 200, so a photo
 *                  dark by design is not pulled into daylight
 *   midtones       lifted (gamma down to 0.7) only when the photo is dark
 *
 * Measured on a small copy (the quality check's), applied to the full one.
 * A photograph already fine comes back `undefined`: nothing to change, and
 * no re-tinted copy of a good picture.
 */
export interface PhotoTone {
  /** Red, green and blue multipliers, applied before the curve. */
  gains: [number, number, number];
  /** 256 entries: the levels and midtone curve. */
  lut: Uint8ClampedArray;
}

const GAIN_MIN = 0.9;
const GAIN_MAX = 1.12;
const LO_MAX = 40;
const HI_MIN = 200;
const GAMMA_MIN = 0.7;
/** Below this the mean is dark enough to lift the midtones. */
const DARK_NORM = 0.42;
/** The largest change, 0–255, a fix must make to be worth applying. */
const VISIBLE = 6;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function toneFor(rgba: ArrayLike<number>, width: number, height: number): PhotoTone | undefined {
  const pixels = Math.min(width * height, Math.floor(rgba.length / 4));
  if (pixels < 9) return undefined;

  let r = 0;
  let g = 0;
  let b = 0;
  const histogram = new Uint32Array(256);
  for (let i = 0; i < pixels * 4; i += 4) {
    const red = rgba[i]!;
    const green = rgba[i + 1]!;
    const blue = rgba[i + 2]!;
    r += red;
    g += green;
    b += blue;
    histogram[Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue)]! += 1;
  }
  const grey = (r + g + b) / 3;
  const gains: [number, number, number] = [
    r > 0 ? clamp(grey / r, GAIN_MIN, GAIN_MAX) : 1,
    g > 0 ? clamp(grey / g, GAIN_MIN, GAIN_MAX) : 1,
    b > 0 ? clamp(grey / b, GAIN_MIN, GAIN_MAX) : 1,
  ];

  const percentile = (share: number) => {
    let seen = 0;
    for (let level = 0; level < 256; level += 1) {
      seen += histogram[level]!;
      if (seen >= share * pixels) return level;
    }
    return 255;
  };
  const lo = Math.min(percentile(0.005), LO_MAX);
  const hi = Math.max(percentile(0.995), HI_MIN);
  let mean = 0;
  for (let level = 0; level < 256; level += 1) mean += level * histogram[level]!;
  mean /= pixels;
  const norm = clamp((mean - lo) / (hi - lo), 0.05, 1);
  const gamma = norm < DARK_NORM ? Math.max(GAMMA_MIN, Math.log(0.45) / Math.log(norm)) : 1;

  const lut = new Uint8ClampedArray(256);
  let largest = 0;
  for (let level = 0; level < 256; level += 1) {
    lut[level] = Math.round(255 * clamp((level - lo) / (hi - lo), 0, 1) ** gamma);
    largest = Math.max(largest, Math.abs(lut[level]! - level));
  }
  const cast = Math.max(...gains.map((gain) => Math.abs(gain - 1) * 255));
  return Math.max(largest, cast) < VISIBLE ? undefined : { gains, lut };
}

/** Applies a tone to RGBA pixels in place. Alpha is left alone. */
export function applyTone(rgba: Uint8ClampedArray, tone: PhotoTone): void {
  const [kr, kg, kb] = tone.gains;
  const { lut } = tone;
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = lut[Math.min(255, Math.round(rgba[i]! * kr))]!;
    rgba[i + 1] = lut[Math.min(255, Math.round(rgba[i + 1]! * kg))]!;
    rgba[i + 2] = lut[Math.min(255, Math.round(rgba[i + 2]! * kb))]!;
  }
}
