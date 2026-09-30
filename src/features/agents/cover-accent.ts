import { ACCENTS, type AccentId } from './accents.js';

/**
 * The accent a cover photograph suggests (plan §3.1), from pixels the editor
 * already has: the small copy it draws for the photo-quality check.
 *
 * ALWAYS ONE OF THE SIX. The accent is a brand decision (accents.ts): each
 * pair's contrast is measured in accents.test.ts, and none of them is blue.
 * So this never invents a colour — it picks the offered accent whose hue is
 * nearest the photo's strongest colour, and the contrast is already proven.
 *
 * NEVER BLUE, AND NEVER THE SKY. Blue pixels are skipped rather than mapped
 * to the nearest non-blue accent: a balcony shot is mostly sky, and "the sky
 * is blue, so the listing is green" is noise, not a suggestion.
 *
 * NOTHING WHEN THE PHOTO HAS NO COLOUR. White walls and grey floors are the
 * typical Israeli interior; a faint tint there is not a reason to leave the
 * default. Undefined means "keep what you have".
 *
 * Weights are chroma, so one saturated sofa outweighs a beige wall.
 */

/** Below this chroma a pixel is grey, and says nothing about hue. */
const MIN_CHROMA = 0.12;
/** Near-black and near-white pixels carry no reliable hue. */
const MIN_LIGHTNESS = 0.12;
const MAX_LIGHTNESS = 0.92;
/** Skipped hues, degrees: the blues (and so the sky and the sea). */
const BLUE_FROM = 190;
const BLUE_TO = 260;
/** The strongest hue must hold this much chroma per pixel of the frame. */
const MIN_STRENGTH = 0.02;
const BINS = 12;

export function hueOf(r: number, g: number, b: number): { hue: number; chroma: number; lightness: number } {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max - min;
  const lightness = (max + min) / 2;
  if (chroma === 0) return { hue: 0, chroma, lightness };
  let hue: number;
  if (max === red) hue = ((green - blue) / chroma) % 6;
  else if (max === green) hue = (blue - red) / chroma + 2;
  else hue = (red - green) / chroma + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { hue, chroma, lightness };
}

function hexHue(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  return hueOf((value >> 16) & 255, (value >> 8) & 255, value & 255).hue;
}

/** The hued accents and their hues. Charcoal has none and is never suggested. */
const HUES = ACCENTS.filter((accent) => accent.id !== 'charcoal').map((accent) => ({
  id: accent.id as AccentId,
  hue: hexHue(accent.base),
}));

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** The nearest offered accent to a hue. */
export function nearestAccent(hue: number): AccentId {
  let best = HUES[0]!;
  for (const candidate of HUES) {
    if (hueDistance(hue, candidate.hue) < hueDistance(hue, best.hue)) best = candidate;
  }
  return best.id;
}

/** The accent a photograph suggests, or undefined to keep the current one. */
export function coverAccent(rgba: ArrayLike<number>, width: number, height: number): AccentId | undefined {
  const pixels = width * height;
  if (pixels === 0) return undefined;

  const weight = new Float64Array(BINS);
  const sin = new Float64Array(BINS);
  const cos = new Float64Array(BINS);

  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 4;
    const { hue, chroma, lightness } = hueOf(rgba[offset]!, rgba[offset + 1]!, rgba[offset + 2]!);
    if (chroma < MIN_CHROMA || lightness < MIN_LIGHTNESS || lightness > MAX_LIGHTNESS) continue;
    if (hue >= BLUE_FROM && hue <= BLUE_TO) continue;
    const bin = Math.floor(hue / (360 / BINS)) % BINS;
    const radians = (hue * Math.PI) / 180;
    weight[bin]! += chroma;
    sin[bin]! += Math.sin(radians) * chroma;
    cos[bin]! += Math.cos(radians) * chroma;
  }

  let top = 0;
  for (let bin = 1; bin < BINS; bin += 1) {
    if (weight[bin]! > weight[top]!) top = bin;
  }
  if (weight[top]! / pixels < MIN_STRENGTH) return undefined;

  // The bin's own mean hue, circular, so a bin that straddles 0° averages
  // to red rather than to cyan.
  let hue = (Math.atan2(sin[top]!, cos[top]!) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return nearestAccent(hue);
}
