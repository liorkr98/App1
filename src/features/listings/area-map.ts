import { allPlaces, type AreaPlace, type AreaPlaces } from './area-note.js';
import type { AreaGroup } from './osm-area.js';

/**
 * The neighbourhood map: what is around this address, drawn where it is.
 *
 * ===================== STREETS FROM TILES, PLACES FROM US =====================
 * The pins are coordinates we already hold. The streets under them are OSM
 * raster tiles, requested by the buyer's browser — not an Overpass query, not
 * a geocoder, not Distance Matrix. The listing page still does not look up
 * the neighbourhood at view time (CLAUDE.md §12); it only paints a basemap
 * that OSM already published, with the ODbL credit this page already carries.
 *
 * Without the tiles the drawing was a beige grid of dots, which is what
 * "the map still doesn't work" was reporting.
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
  /** The property itself, in the same pixel space as the pins. */
  origin: { x: number; y: number };
  width: number;
  height: number;
  /** OSM tile mosaic under the pins. One zoom, integer tile indices. */
  zoom: number;
  tileX0: number;
  tileY0: number;
  cols: number;
  rows: number;
}

export function osmTileUrl(zoom: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

/** Enough to be useful, few enough to be readable on a phone. */
const MAX_PINS = 8;

const TILE = 256;
const MIN_ZOOM = 14;
const MAX_ZOOM = 16;

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
 * Web Mercator pixels at a zoom — the same space OSM tiles are cut from.
 * West is smaller x, south is larger y. The map does not mirror for Hebrew.
 */
function lonToX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom * TILE;
}

function latToY(lat: number, zoom: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  const clamped = Math.min(Math.max(s, -0.9999), 0.9999);
  return (0.5 - Math.log((1 + clamped) / (1 - clamped)) / (4 * Math.PI)) * 2 ** zoom * TILE;
}

function zoomFor(span: number): number {
  const pixels = (z: number) => (span / 360) * 2 ** z * TILE;
  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    if (pixels(zoom) < TILE * 2.8) return zoom;
  }
  return MIN_ZOOM;
}

/**
 * Coordinates to a drawing that sits on OSM street tiles.
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
  const span = Math.max(
    ...picked.map((place) => {
      const east = Math.abs(place.lon - origin.lon) * lonScale;
      const north = Math.abs(place.lat - origin.lat);
      return Math.max(east, north);
    }),
    0.002,
  );

  const zoom = zoomFor(span);
  const worldX = lonToX(origin.lon, zoom);
  const worldY = latToY(origin.lat, zoom);

  const worlds = picked.map((place) => ({
    place,
    x: lonToX(place.lon, zoom),
    y: latToY(place.lat, zoom),
  }));

  const minX = Math.min(worldX, ...worlds.map((p) => p.x)) - 48;
  const maxX = Math.max(worldX, ...worlds.map((p) => p.x)) + 48;
  const minY = Math.min(worldY, ...worlds.map((p) => p.y)) - 48;
  const maxY = Math.max(worldY, ...worlds.map((p) => p.y)) + 48;

  const tileX0 = Math.floor(minX / TILE);
  const tileY0 = Math.floor(minY / TILE);
  const tileX1 = Math.floor(maxX / TILE);
  const tileY1 = Math.floor(maxY / TILE);
  const cols = tileX1 - tileX0 + 1;
  const rows = tileY1 - tileY0 + 1;
  const originPx = {
    x: worldX - tileX0 * TILE,
    y: worldY - tileY0 * TILE,
  };

  return {
    pins: worlds.map((item, index) => ({
      key: KEYS[index] ?? '',
      name: item.place.name,
      group: groupOf(places, item.place),
      ...(item.place.walkMinutes === undefined ? {} : { walkMinutes: item.place.walkMinutes }),
      x: Math.round(item.x - tileX0 * TILE),
      y: Math.round(item.y - tileY0 * TILE),
    })),
    origin: { x: Math.round(originPx.x), y: Math.round(originPx.y) },
    width: cols * TILE,
    height: rows * TILE,
    zoom,
    tileX0,
    tileY0,
    cols,
    rows,
  };
}

/** True when any pin has a routed time, so the page knows whether to say so. */
export function hasWalkTimes(places: AreaPlaces): boolean {
  return allPlaces(places).some((place) => place.walkMinutes !== undefined);
}
