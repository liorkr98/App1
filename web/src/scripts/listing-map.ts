/**
 * The live neighbourhood map, drawn over the static one (PR B, 5 Oct 2026).
 *
 * LOADED ONLY WHEN WANTED. listing-enhance.ts imports this module when the
 * map section comes within 300 px of the screen, and this module fetches
 * MapLibre — about 305 KB gzipped — from our own versioned path
 * (integrations/vendor-maplibre.mjs). Nothing of it is on the first load, so
 * the page's 12 KB budget and its first paint are untouched.
 *
 * THE DRAWING STAYS UNTIL THE MAP HAS PAINTED. The live map sits in the same
 * box as the static picture and fades in on its first `idle`; until then,
 * and for good if anything fails — no WebGL, data saver, tiles that do not
 * answer — the drawing is what the buyer sees. Nothing on the page moves.
 *
 * WHAT IT SHOWS, AND WHAT IT DOES NOT. Tiles are OpenFreeMap (OpenStreetMap
 * data, no key, commercial use allowed), requested by the buyer's browser
 * after first paint. The page still queries nothing about the address at
 * view time (CLAUDE.md §12): the pins, names and walking minutes come from
 * the listing row. The home is a soft circle around the street's midpoint,
 * never a pin on a building, and a seller who hid the street gets no map
 * section at all (showListingMap).
 *
 * HEBREW. MapLibre 6 orders right-to-left text itself, so no RTL plugin is
 * loaded. Street names are asked for in Hebrew (`name:he`, then the local
 * `name`), and Hebrew letters are drawn with our own self-hosted Heebo
 * through the style's font faces, whatever fonts the tile host carries.
 * The pins are HTML, so they use the page's fonts and its <bdi> rules.
 *
 * A MAP DOES NOT MIRROR. North is up in Hebrew too (area-map.ts).
 */

import type { Feature, Polygon } from 'geojson';
import type * as MapLibre from 'maplibre-gl';

import type { LiveMapData } from '@/features/listings/area-map';

/** What the page hands over: the data, plus the Hebrew it needs said. */
export interface LiveMapPayload extends LiveMapData {
  pins: (LiveMapData['pins'][number] & { walk?: string; label: string })[];
  text: Record<
    | 'region'
    | 'home'
    | 'gestureMobile'
    | 'gestureWindows'
    | 'gestureMac'
    | 'zoomIn'
    | 'zoomOut'
    | 'fullscreenEnter'
    | 'fullscreenExit'
    | 'attribution'
    | 'close'
    | 'marker',
    string
  >;
}

const BASE = import.meta.env.PUBLIC_MAPLIBRE_BASE;
const STYLE = 'https://tiles.openfreemap.org/styles/positron';
const ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> · <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>';
const HEBREW_FONT = '/fonts/heebo-hebrew.woff2';
const HEBREW_RANGE = ['U+0590-05FF', 'U+FB1D-FB4F'];
/** A map that has not painted by now is not going to; the drawing stays. */
const GIVE_UP_MS = 15_000;

/** Whether this browser, on this connection, should get a live map at all. */
function wanted(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return false;
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

function stylesheet(href: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`link[href="${href}"]`)) return resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error('css'));
    document.head.append(link);
  });
}

/** A ring of points around the centre, for the home circle. */
function circle(center: [number, number], metres: number): Feature<Polygon> {
  const [lon, lat] = center;
  const dLat = metres / 111_320;
  const dLon = dLat / Math.cos((lat * Math.PI) / 180);
  const ring: [number, number][] = [];
  for (let step = 0; step <= 64; step += 1) {
    const angle = (step / 64) * 2 * Math.PI;
    ring.push([lon + dLon * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

/** Names in Hebrew where OpenStreetMap has them; the local name otherwise. */
function hebrewLabels(map: MapLibre.Map): void {
  const fonts = new Set<string>();
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue;
    const field = map.getLayoutProperty(layer.id, 'text-field') as unknown;
    if (field !== undefined && JSON.stringify(field).includes('name')) {
      map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:he'], ['get', 'name']]);
    }
    const font = map.getLayoutProperty(layer.id, 'text-font') as unknown;
    if (Array.isArray(font)) for (const name of font) if (typeof name === 'string') fonts.add(name);
  }
  // Our Heebo for Hebrew letters, under every font name the style uses.
  const faces = Object.fromEntries(
    [...fonts].map((name) => [name, [{ url: HEBREW_FONT, 'unicode-range': HEBREW_RANGE }]]),
  );
  if (fonts.size > 0) map.setFontFaces(faces);
}

/**
 * A pin: a small dot carrying its number from the list under the map. The
 * name and the walking time open on tap; on a phone, eight chips carrying
 * minutes covered each other and the street they were about.
 */
function pinElement(pin: LiveMapPayload['pins'][number]): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.className = `live-pin live-pin--${pin.group}`;
  node.setAttribute('aria-label', pin.label);
  const key = document.createElement('bdi');
  key.textContent = pin.key;
  node.append(key);
  return node;
}

function popupContent(pin: LiveMapPayload['pins'][number]): HTMLElement {
  const box = document.createElement('div');
  box.className = 'live-pop';
  box.dir = 'rtl';
  const name = document.createElement('b');
  name.textContent = pin.name;
  box.append(name);
  if (pin.walk) {
    const walk = document.createElement('span');
    walk.textContent = pin.walk;
    box.append(walk);
  }
  return box;
}

export async function mountLiveMap(host: HTMLElement): Promise<void> {
  const raw = host.querySelector('script[type="application/json"]')?.textContent;
  if (!raw || !wanted()) return;
  const data = JSON.parse(raw) as LiveMapPayload;

  let lib: typeof MapLibre;
  try {
    await stylesheet(`${BASE}maplibre-gl.css`);
    lib = (await import(/* @vite-ignore */ `${BASE}maplibre-gl.mjs`)) as typeof MapLibre;
  } catch {
    return;
  }

  const box = document.createElement('div');
  box.className = 'live-map';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', data.text.region);
  host.append(box);
  host.dataset.live = 'loading';

  const accent = getComputedStyle(host).getPropertyValue('--ls-accent').trim() || '#4a5d3a';
  let painted = false;
  let map: MapLibre.Map;

  const giveUp = () => {
    if (painted) return;
    try {
      map?.remove();
    } catch {
      /* already gone */
    }
    box.remove();
    delete host.dataset.live;
  };

  try {
    map = new lib.Map({
      container: box,
      style: STYLE,
      bounds: data.bounds,
      fitBoundsOptions: { padding: 28 },
      minZoom: 12,
      maxZoom: 18,
      // One finger scrolls the page; two move the map. A buyer reading on a
      // phone must never get stuck inside it.
      cooperativeGestures: true,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // ODbL (CLAUDE.md §10): the credit is ours to show whatever the tile
      // host's style declares, and it is not collapsed behind an icon.
      attributionControl: { compact: false, customAttribution: ATTRIBUTION },
      locale: {
        'CooperativeGesturesHandler.MobileHelpText': data.text.gestureMobile,
        'CooperativeGesturesHandler.WindowsHelpText': data.text.gestureWindows,
        'CooperativeGesturesHandler.MacHelpText': data.text.gestureMac,
        'NavigationControl.ZoomIn': data.text.zoomIn,
        'NavigationControl.ZoomOut': data.text.zoomOut,
        'FullscreenControl.Enter': data.text.fullscreenEnter,
        'FullscreenControl.Exit': data.text.fullscreenExit,
        'AttributionControl.ToggleAttribution': data.text.attribution,
        'Popup.Close': data.text.close,
        'Marker.Title': data.text.marker,
      },
    });
  } catch {
    giveUp();
    return;
  }

  map.touchZoomRotate.disableRotation();
  map.addControl(new lib.NavigationControl({ showCompass: false }), 'top-left');
  map.addControl(new lib.FullscreenControl(), 'top-left');

  const timer = window.setTimeout(giveUp, GIVE_UP_MS);
  map.on('error', () => {
    if (!painted) giveUp();
  });

  map.on('style.load', () => {
    hebrewLabels(map);
    map.addSource('home', { type: 'geojson', data: circle(data.center, data.homeRadiusM) });
    map.addLayer({
      id: 'home-fill',
      type: 'fill',
      source: 'home',
      paint: { 'fill-color': accent, 'fill-opacity': 0.16 },
    });
    map.addLayer({
      id: 'home-line',
      type: 'line',
      source: 'home',
      paint: { 'line-color': accent, 'line-width': 1.5, 'line-opacity': 0.6 },
    });
  });

  for (const pin of data.pins) {
    const popup = new lib.Popup({ offset: 18, closeButton: false, maxWidth: '240px' }).setDOMContent(
      popupContent(pin),
    );
    new lib.Marker({ element: pinElement(pin), anchor: 'center' })
      .setLngLat([pin.lon, pin.lat])
      .setPopup(popup)
      .addTo(map);
  }

  map.once('idle', () => {
    painted = true;
    window.clearTimeout(timer);
    host.dataset.live = 'ready';
  });
}
