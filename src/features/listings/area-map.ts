import { allPlaces, type AreaPlace, type AreaPlaces } from './area-note.js';
import type { AreaGroup } from './osm-area.js';

/**
 * The neighbourhood map: what is around this address, drawn where it is.
 *
 * ===================== NO TILE, AT RENDER OR EVER =====================
 * The listing page must not fetch OpenStreetMap — or anyone — when a buyer
 * opens the link (CLAUDE.md §12). So this is not a tile map with a marker
 * layer: it is an SVG built from coordinates we already hold, drawn at publish
 * and served as part of the page. It costs no request, works on a train, and
 * cannot leak a reader's address to a third party.
 *
 * What it therefore is NOT is a street map — we hold points, not road
 * geometry, so there are no roads on it. It is a plan of what sits around the
 * flat and in which direction, which is the question a buyer actually has.
 * =======================================================================
 *
 * ===================== A MAP MUST NOT MIRROR (§4.1) =====================
 * Every other box on this page flips for Hebrew. This one must not: north is
 * up and east is east in every language, and a mirrored map is a wrong map.
 *
 * That is why the positions are SVG geometry rather than CSS offsets. There is
 * no `inset-inline-start` here to flip, and no physical `left` for the build
 * gate to catch, because the coordinates are attributes inside a viewBox.
 * =======================================================================
 *
 * ===================== NO TEXT INSIDE THE DRAWING =====================
 * Names and walking minutes live in the HTML list beside the map, not in the
 * SVG. Two reasons, both hard: a number inside `<text>` cannot be wrapped in
 * `<bdi>`, and §4.2 is not negotiable; and a screen reader should read a list,
 * not a picture. The drawing carries Hebrew letter keys — א, ב, ג — which the
 * list repeats, so the two halves are one thing.
 * =======================================================================
 */

/** One thing on the map, with the key that ties the drawing to the list. */
export interface AreaMapPin {
  /** א, ב, ג … the Hebrew ordinal, which is also the label in the drawing. */
  key: string;
  name: string;
  group: AreaGroup;
  /** Routed minutes, or absent. Never derived from the geometry. */
  walkMinutes?: number;
  /** Position inside the viewBox below. */
  x: number;
  y: number;
}

export interface AreaMap {
  pins: AreaMapPin[];
  /** The property itself, at the centre of the drawing. */
  origin: { x: number; y: number };
  width: number;
  height: number;
}

/** Enough to be useful, few enough to be readable on a phone. */
const MAX_PINS = 8;

const VIEW_WIDTH = 800;

/** Never so short that the drawing reads as a strip rather than a map. */
const MIN_HALF_HEIGHT = 130;

/** Room for a pin's circle and its letter at the very edge. */
const PADDING = 46;

/**
 * The Hebrew alphabet as ordinals, which is how a Hebrew list is keyed.
 *
 * Letters rather than digits, and not only for style: a digit in the drawing
 * would be a number outside `<bdi>` in the built page, which §4.2 forbids and
 * the build gate rejects.
 */
const KEYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י'];

/**
 * Which places go on the map, in which order.
 *
 * One from each group before a second from any of them, so eight pins describe
 * the neighbourhood rather than eight bus stops. Within that, the ones with a
 * routed walking time come first — they are the ones the page can say most
 * about.
 */
function chosen(places: AreaPlaces): AreaPlace[] {
  const groups = [places.transit, places.schools, places.parks, places.community, places.shops];
  const picked: AreaPlace[] = [];

  for (let round = 0; round < 3 && picked.length < MAX_PINS; round += 1) {
    for (const group of groups) {
      const place = group[round];
      if (place && picked.length < MAX_PINS) picked.push(place);
    }
  }

  return picked;
}

/** Which group a place came from, so the drawing can colour it. */
function groupOf(places: AreaPlaces, place: AreaPlace): AreaGroup {
  if (places.transit.includes(place)) return 'transit';
  if (places.schools.includes(place)) return 'school';
  if (places.parks.includes(place)) return 'park';
  if (places.community.includes(place)) return 'community';
  if (places.shops.includes(place)) return 'shop';
  return 'neighbourhood';
}

/**
 * Coordinates to a drawing.
 *
 * Equirectangular, with longitude scaled by cos(latitude) — at Israel's
 * latitude a degree of longitude is about 0.84 of a degree of latitude, and
 * ignoring that stretches the map sideways by a sixth. One scale for both axes
 * so the SHAPE is true: two places equally far from the flat are equally far
 * from the pin, whichever direction they lie in.
 *
 * Returns undefined when there is nothing to draw — no origin, or no place
 * with a position. A map of nothing is not rendered at all (§7).
 */
export function areaMap(places: AreaPlaces): AreaMap | undefined {
  const origin = places.origin;
  if (!origin) return undefined;

  const picked = chosen(places);
  if (picked.length === 0) return undefined;

  const lonScale = Math.cos((origin.lat * Math.PI) / 180);
  const offsets = picked.map((place) => ({
    place,
    east: (place.lon - origin.lon) * lonScale,
    // Screen y grows downwards and north is up, so this is negated.
    south: -(place.lat - origin.lat),
  }));

  /*
   * ONE SCALE FOR BOTH AXES, and then the FRAME is fitted to what was drawn.
   *
   * A fixed 800x420 box letterboxed the drawing: the places sat in a square
   * patch in the middle with a third of the height empty above and below,
   * which is the same "large blank space" the homepage was reported for.
   *
   * Scaling the axes separately would fill the box and distort the map — two
   * places equally far from the flat would look unequally far. So the scale
   * stays uniform and the viewBox shrinks to the content instead.
   */
  // A floor of roughly 200 metres, so one very close place is not magnified
  // into a map of a single street corner.
  const FLOOR = 0.0018;
  const reachEast = Math.max(...offsets.map((o) => Math.abs(o.east)), FLOOR);
  const reachSouth = Math.max(...offsets.map((o) => Math.abs(o.south)), FLOOR);

  /*
   * The scale that fits BOTH axes. Taking the width alone put a pin outside
   * the frame whenever the places were spread more north-to-south than
   * east-to-west, because the height is capped — a phone must not get a map
   * and nothing else. Fitting the tighter axis keeps everything inside and
   * keeps one scale for both, so the shape stays true.
   */
  const MAX_HEIGHT = Math.round(VIEW_WIDTH * 0.75);
  const scale = Math.min(
    (VIEW_WIDTH / 2 - PADDING) / reachEast,
    (MAX_HEIGHT / 2 - PADDING) / reachSouth,
  );

  const drawn = offsets.map((offset, index) => ({
    key: KEYS[index] ?? '',
    name: offset.place.name,
    group: groupOf(places, offset.place),
    ...(offset.place.walkMinutes === undefined
      ? {}
      : { walkMinutes: offset.place.walkMinutes }),
    x: offset.east * scale,
    y: offset.south * scale,
  }));

  /*
   * The frame, fitted to what was drawn and symmetric about the flat.
   *
   * Symmetric because the property is the thing a reader orients from, so it
   * belongs in the middle. Fitted because a fixed box letterboxed the drawing:
   * the places sat in a patch in the centre with a third of the height empty,
   * which is the same dead space the homepage was reported for.
   */
  const spreadY = Math.max(...drawn.map((pin) => Math.abs(pin.y)), MIN_HALF_HEIGHT);
  const height = Math.min(Math.round((spreadY + PADDING) * 2), MAX_HEIGHT);
  const centre = { x: VIEW_WIDTH / 2, y: height / 2 };

  return {
    pins: drawn.map((pin) => ({
      ...pin,
      x: Math.round(centre.x + pin.x),
      y: Math.round(centre.y + pin.y),
    })),
    origin: centre,
    width: VIEW_WIDTH,
    height,
  };
}

/** True when any pin has a routed time, so the page knows whether to say so. */
export function hasWalkTimes(places: AreaPlaces): boolean {
  return allPlaces(places).some((place) => place.walkMinutes !== undefined);
}
