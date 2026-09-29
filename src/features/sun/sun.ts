/**
 * Where the sun is, from a place and a moment — the maths behind the
 * Heliograph template (שמש).
 *
 * The formulas are SunCalc's (Vladimir Agafonkin, BSD-2), which follow the
 * Astronomical Almanac approximations: good to a fraction of a degree, which
 * is far finer than a balcony. Pure and deterministic, so the page can be
 * rendered on the server and tested here.
 *
 * This is the sun's PATH, not a light measurement. Buildings and trees are
 * not in it, and the page says so next to it.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2_440_588;
const J2000 = 2_451_545;
const OBLIQUITY = RAD * 23.4397;

export interface SunPosition {
  /** Compass bearing in degrees: 0 north, 90 east, 180 south, 270 west. */
  bearing: number;
  /** Degrees above the horizon; negative is below it. */
  altitude: number;
}

export function sunPosition(date: Date, lat: number, lng: number): SunPosition {
  const d = date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(OBLIQUITY), Math.cos(L));
  const H = RAD * (280.16 + 360.9856235 * d) + RAD * lng - ra;
  const phi = RAD * lat;
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  return { bearing: (((az / RAD + 180) % 360) + 360) % 360, altitude: alt / RAD };
}

/**
 * The two days the page compares. Israel keeps summer time on 21 June
 * (UTC+3) and standard time on 21 December (UTC+2); the offset is part of
 * the season so a clock on the page reads what a wall clock would.
 */
export const SEASONS = {
  summer: { month: 5, day: 21, utcOffset: 3 },
  winter: { month: 11, day: 21, utcOffset: 2 },
} as const;
export type Season = keyof typeof SEASONS;

/** A local wall-clock hour (e.g. 12.75 = 12:45) on the season's day. */
export function seasonMoment(season: Season, hour: number, year = 2026): Date {
  const s = SEASONS[season];
  return new Date(Date.UTC(year, s.month, s.day) + (hour - s.utcOffset) * 3_600_000);
}

/** The smallest angle between two bearings, 0–180. */
export function bearingGap(a: number, b: number): number {
  return Math.abs((((a - b + 540) % 360) + 360) % 360 - 180);
}

/** The Hebrew aspect options (schemas/property.ts) as compass bearings. */
export const ASPECT_BEARING: Readonly<Record<string, number>> = {
  צפון: 0,
  'צפון־מזרח': 45,
  מזרח: 90,
  'דרום־מזרח': 135,
  דרום: 180,
  'דרום־מערב': 225,
  מערב: 270,
  'צפון־מערב': 315,
};

/**
 * The sky plot: a circle seen from above, north up (a map — it never mirrors
 * in RTL). The zenith is the centre, the horizon the rim, so a point's
 * distance from the centre is how low the sun is.
 */
export const PLOT = { cx: 100, cy: 100, r: 88 } as const;

export function plotPoint(sun: SunPosition): [number, number] {
  const r = (PLOT.r * (90 - Math.max(-8, sun.altitude))) / 90;
  const b = sun.bearing * RAD;
  return [PLOT.cx + r * Math.sin(b), PLOT.cy - r * Math.cos(b)];
}

/** The day's path above the horizon, as an SVG path, sampled every 15 min. */
export function dayArc(season: Season, lat: number, lng: number): string {
  const points: string[] = [];
  for (let hour = 3; hour <= 22; hour += 0.25) {
    const sun = sunPosition(seasonMoment(season, hour), lat, lng);
    if (sun.altitude < 0) continue;
    const [x, y] = plotPoint(sun);
    points.push(`${points.length ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return points.join(' ');
}

/** The wedge of sky a facade faces (±60°), as an SVG path. */
export function facadeWedge(facing: number): string {
  const at = (deg: number) => [PLOT.cx + PLOT.r * Math.sin(deg * RAD), PLOT.cy - PLOT.r * Math.cos(deg * RAD)];
  const [x1, y1] = at(facing - 60);
  const [x2, y2] = at(facing + 60);
  return `M${PLOT.cx} ${PLOT.cy} L${x1!.toFixed(1)} ${y1!.toFixed(1)} A${PLOT.r} ${PLOT.r} 0 0 1 ${x2!.toFixed(1)} ${y2!.toFixed(1)} Z`;
}

/**
 * Minutes of direct sun on a facade facing `facing`, on the season's day:
 * the sun above the horizon and in front of the wall (within 90°). Sampled
 * every five minutes, which is finer than anyone reads the answer.
 */
export function facadeSunMinutes(season: Season, lat: number, lng: number, facing: number): number {
  let minutes = 0;
  for (let hour = 3; hour <= 22; hour += 5 / 60) {
    const sun = sunPosition(seasonMoment(season, hour), lat, lng);
    if (sun.altitude > 0 && bearingGap(sun.bearing, facing) < 90) minutes += 5;
  }
  return minutes;
}
