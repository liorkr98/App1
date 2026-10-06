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
  /** Where it is, for the live map (listing-map.ts). Same place, same key. */
  lat: number;
  lon: number;
}

export interface AreaMap {
  pins: AreaMapPin[];
  /** The property itself, in the same pixel space as the pins. */
  origin: { x: number; y: number };
  /**
   * The street's midpoint (overpass.ts), which is where walking times are
   * measured from. Never the building: nothing here knows the building.
   */
  center: { lat: number; lon: number };
  width: number;
  height: number;
  /** OSM tile mosaic under the pins. One zoom, integer tile indices. */
  zoom: number;
  tileX0: number;
  tileY0: number;
  cols: number;
  rows: number;
}

/**
 * One picture, 16:10, no tile requests and no text.
 *
 * Circles only. The numerals live in the HTML list, inside <bdi>. This is
 * the first paint and the fallback; the street map with tiles is the live
 * map that loads over it later (liveMapData, scripts/listing-map.ts).
 */
export function composedMapSrc(map: AreaMap): string {
  const width = 1600;
  const height = 1000;
  const sx = width / map.width;
  const sy = height / map.height;
  const pins = map.pins
    .map(
      (pin) =>
        `<circle cx="${Math.round(pin.x * sx)}" cy="${Math.round(pin.y * sy)}" r="22" fill="#4a5d3a"/>`,
    )
    .join('');
  const origin = `<circle cx="${Math.round(map.origin.x * sx)}" cy="${Math.round(map.origin.y * sy)}" r="16" fill="#fbfaf7"/><circle cx="${Math.round(map.origin.x * sx)}" cy="${Math.round(map.origin.y * sy)}" r="9" fill="#191a15"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#e4dfd4"/>${pins}${origin}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
 * Pin index. A Hebrew letter reads as a word (א is "a", not "1"), so the
 * list prints a numeral and the page wraps it in <bdi>. The drawing itself
 * has no text node — a digit inside SVG <text> cannot be isolated.
 */

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
      key: String(index + 1),
      name: item.place.name,
      group: groupOf(places, item.place),
      ...(item.place.walkMinutes === undefined ? {} : { walkMinutes: item.place.walkMinutes }),
      x: Math.round(item.x - tileX0 * TILE),
      y: Math.round(item.y - tileY0 * TILE),
      lat: item.place.lat,
      lon: item.place.lon,
    })),
    origin: { x: Math.round(originPx.x), y: Math.round(originPx.y) },
    center: { lat: origin.lat, lon: origin.lon },
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

/**
 * What the live map needs, handed to the page as JSON (AreaMap.astro).
 *
 * The same pins as the drawing and the list, with the same keys, so the
 * three are one thing. The home is a soft circle around the street's
 * midpoint, never a pin on a building; its radius is wide enough that it
 * cannot be read as one.
 *
 * Bounds frame every pin and the home with a margin, [west, south] then
 * [east, north] — MapLibre's order. North stays up: a map never mirrors.
 */
export interface LiveMapData {
  center: [number, number];
  bounds: [[number, number], [number, number]];
  homeRadiusM: number;
  pins: {
    key: string;
    name: string;
    group: AreaGroup;
    walkMinutes?: number;
    lon: number;
    lat: number;
  }[];
}

/** About a city block each way: a neighbourhood, never a doorstep. */
export const HOME_RADIUS_M = 150;

export function liveMapData(map: AreaMap): LiveMapData {
  const lons = [map.center.lon, ...map.pins.map((pin) => pin.lon)];
  const lats = [map.center.lat, ...map.pins.map((pin) => pin.lat)];
  // ~150 m of margin, so the home circle and the edge pins are not cut off.
  const padLat = HOME_RADIUS_M / 111_320;
  const padLon = padLat / Math.max(Math.cos((map.center.lat * Math.PI) / 180), 0.2);
  const round = (value: number) => Math.round(value * 1e6) / 1e6;

  return {
    center: [round(map.center.lon), round(map.center.lat)],
    bounds: [
      [round(Math.min(...lons) - padLon), round(Math.min(...lats) - padLat)],
      [round(Math.max(...lons) + padLon), round(Math.max(...lats) + padLat)],
    ],
    homeRadiusM: HOME_RADIUS_M,
    pins: map.pins.map((pin) => ({
      key: pin.key,
      name: pin.name,
      group: pin.group,
      ...(pin.walkMinutes === undefined ? {} : { walkMinutes: pin.walkMinutes }),
      lon: round(pin.lon),
      lat: round(pin.lat),
    })),
  };
}
