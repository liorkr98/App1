/**
 * Equirectangular projection maths for the panorama stitcher (D2).
 *
 * ORIENTATION-BASED, not feature-matching. The capture flow already records
 * the device attitude for every shot, so the geometry is known before a single
 * pixel is compared. Feature matching (Hugin, OpenCV) solves the harder
 * problem of stitching photos whose orientation is unknown — it is slower, it
 * needs texture to lock onto, and it fails on exactly the surfaces a room is
 * made of: blank walls, plain ceilings, glass. See ADR 0001 and
 * docs/adr/0002-panorama-stitching.md.
 *
 * Deliberately dependency-free. Everything here is pure arithmetic so it can
 * be unit-tested without sharp, ffmpeg or a network.
 *
 * Conventions, stated once because every sign error below comes from these:
 *
 *   World frame  X right, Y up, Z forward. A camera at yaw=0, pitch=0 looks
 *                down +Z.
 *   Longitude    measured from +Z toward +X, in [-PI, PI).
 *   Latitude     +PI/2 at the zenith, -PI/2 at the nadir.
 *   Image pixels x grows right, y grows DOWN — opposite to world Y, which is
 *                the one flip that has to happen somewhere.
 */

export type Vec3 = readonly [number, number, number];
/** Row-major 3x3. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

const DEG = Math.PI / 180;

/**
 * Camera attitude as the capture flow reports it, in degrees.
 *
 * Roll is optional because a phone held to the eye is usually near-level, but
 * ignoring it entirely tilts the horizon in the output, which is the single
 * most obvious stitching artefact there is.
 */
export interface Attitude {
  yaw: number;
  pitch: number;
  roll?: number;
}

/**
 * Rotation taking camera-frame directions into world-frame directions.
 *
 * R = Ry(yaw) . Rx(pitch) . Rz(roll), applied right to left: roll about the
 * optical axis first, then tilt, then pan. That is the order the sensor
 * reports them in, and composing them in any other order makes yaw and roll
 * interfere at high pitch.
 */
export function rotationMatrix({ yaw, pitch, roll = 0 }: Attitude): Mat3 {
  const cy = Math.cos(yaw * DEG);
  const sy = Math.sin(yaw * DEG);
  const cp = Math.cos(pitch * DEG);
  // Negated so POSITIVE PITCH LOOKS UP. The bare right-handed rotation about
  // +X does the opposite, and a stitcher that silently inverts pitch produces
  // a panorama that is upside down only when the phone was tilted.
  const sp = -Math.sin(pitch * DEG);
  const cr = Math.cos(roll * DEG);
  const sr = Math.sin(roll * DEG);

  return [
    cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp,
    cp * sr,                 cp * cr,               -sp,
    -sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp,
  ];
}

/** Applies the transpose of `m` — for a rotation, its inverse. */
export function applyTranspose(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
    m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
    m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
  ];
}

/**
 * Unit direction for an equirectangular pixel centre.
 *
 * The +0.5 matters: sampling the top-left corner of each pixel shifts the
 * whole panorama by half a pixel, which shows up as a visible seam where the
 * left and right edges meet in the viewer.
 */
export function equirectDirection(u: number, v: number, width: number, height: number): Vec3 {
  const lon = ((u + 0.5) / width) * 2 * Math.PI - Math.PI;
  const lat = Math.PI / 2 - ((v + 0.5) / height) * Math.PI;
  const cosLat = Math.cos(lat);

  return [cosLat * Math.sin(lon), Math.sin(lat), cosLat * Math.cos(lon)];
}

export interface DirectionTables {
  sinLon: Float64Array;
  cosLon: Float64Array;
  sinLat: Float64Array;
  cosLat: Float64Array;
}

/**
 * Precomputed sines and cosines for every column and row of the canvas.
 *
 * The stitcher visits every output pixel once per shot — roughly 84 million
 * times for a ten-shot room at 4096x2048. Four trig calls in that loop is most
 * of the runtime, and every one of them depends only on the row or the column,
 * never on both. Hoisting them out turns the inner loop into arithmetic.
 *
 * This duplicates the formula in equirectDirection, which is the reference.
 * The test asserts the two agree, because a drift between them would show up
 * as a panorama that is subtly rotated and nothing else.
 */
export function directionTables(width: number, height: number): DirectionTables {
  const sinLon = new Float64Array(width);
  const cosLon = new Float64Array(width);
  const sinLat = new Float64Array(height);
  const cosLat = new Float64Array(height);

  for (let u = 0; u < width; u += 1) {
    const lon = ((u + 0.5) / width) * 2 * Math.PI - Math.PI;
    sinLon[u] = Math.sin(lon);
    cosLon[u] = Math.cos(lon);
  }

  for (let v = 0; v < height; v += 1) {
    const lat = Math.PI / 2 - ((v + 0.5) / height) * Math.PI;
    sinLat[v] = Math.sin(lat);
    cosLat[v] = Math.cos(lat);
  }

  return { sinLon, cosLon, sinLat, cosLat };
}

/**
 * Focal length in pixels for a horizontal field of view.
 *
 * Phone main cameras sit around 65-70 degrees horizontal. The capture flow
 * should send the real value; the default is a reasonable stand-in and being
 * a few degrees out scales the image slightly rather than breaking it.
 */
export function focalLength(imageWidth: number, hfovDegrees: number): number {
  return imageWidth / 2 / Math.tan((hfovDegrees * DEG) / 2);
}

export interface ImagePoint {
  x: number;
  y: number;
}

/**
 * Projects a camera-frame direction onto the image plane.
 *
 * Returns null for anything at or behind the plane. Skipping that check
 * mirrors the scene through the origin — a rear-facing wall lands on top of
 * the wall in front of it, which looks like ghosting rather than an error.
 */
export function projectToImage(
  c: Vec3,
  focal: number,
  width: number,
  height: number,
): ImagePoint | null {
  if (c[2] <= 1e-6) return null;

  const x = width / 2 + (focal * c[0]) / c[2];
  // Negated: world Y is up, image y is down.
  const y = height / 2 - (focal * c[1]) / c[2];

  if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return null;

  return { x, y };
}

/**
 * Blend weight for a sample, ramping to zero at the frame edge.
 *
 * Without this, overlapping shots meet at a hard line and any difference in
 * exposure between them — which a phone's auto-exposure guarantees — reads as
 * a bright or dark stripe down the panorama. The ramp is smoothstepped so the
 * weight's derivative is continuous too; a linear ramp still leaves a faint
 * mach band where the slope changes.
 */
export function featherWeight(
  point: ImagePoint,
  width: number,
  height: number,
  featherFraction = 0.25,
): number {
  const ramp = (distance: number, half: number): number => {
    const band = half * featherFraction;
    if (band <= 0) return 1;
    const t = Math.min(Math.max((half - distance) / band, 0), 1);
    return t * t * (3 - 2 * t);
  };

  const wx = ramp(Math.abs(point.x - width / 2), width / 2);
  const wy = ramp(Math.abs(point.y - height / 2), height / 2);

  // A floor keeps a pixel covered by exactly one shot from vanishing at the
  // very corner, where both ramps reach zero together.
  return Math.max(wx * wy, 1e-4);
}

/**
 * Bilinear sample from a tightly packed RGB buffer.
 *
 * Nearest-neighbour is visibly worse here: every output pixel is a resample at
 * a non-integer position, so nearest aliases every straight edge in the room.
 */
export function sampleRgb(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  out: Float64Array,
): void {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0;
  const fy = y - y0;

  const i00 = (y0 * width + x0) * 3;
  const i10 = (y0 * width + x1) * 3;
  const i01 = (y1 * width + x0) * 3;
  const i11 = (y1 * width + x1) * 3;

  for (let channel = 0; channel < 3; channel += 1) {
    const top = (pixels[i00 + channel] ?? 0) * (1 - fx) + (pixels[i10 + channel] ?? 0) * fx;
    const bottom = (pixels[i01 + channel] ?? 0) * (1 - fx) + (pixels[i11 + channel] ?? 0) * fx;
    out[channel] = top * (1 - fy) + bottom * fy;
  }
}

/**
 * Fraction of the equatorial band that at least one shot covered.
 *
 * Whole-sphere coverage is the wrong measure. Nobody points a phone at the
 * ceiling and the floor while sweeping a room, so a perfectly good panorama
 * covers maybe half the sphere — gating on that would reject every real
 * capture. What actually has to be complete is the band the viewer looks at,
 * so that is what we measure.
 */
export const EQUATOR_BAND_DEGREES = 30;

export function equatorialCoverage(
  weights: Float32Array,
  width: number,
  height: number,
  bandDegrees = EQUATOR_BAND_DEGREES,
): number {
  const half = Math.round((bandDegrees / 180) * height);
  const top = Math.max(Math.floor(height / 2) - half, 0);
  const bottom = Math.min(Math.floor(height / 2) + half, height);

  let covered = 0;
  let total = 0;

  for (let v = top; v < bottom; v += 1) {
    for (let u = 0; u < width; u += 1) {
      total += 1;
      if ((weights[v * width + u] ?? 0) > 0) covered += 1;
    }
  }

  return total === 0 ? 0 : covered / total;
}
