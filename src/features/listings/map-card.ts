/**
 * A self-contained map card. No third-party tile at render.
 *
 * The listing page must not fetch OSM (or anyone) when a buyer opens the
 * link — CLAUDE.md §12, and the sample photos already follow the same rule.
 * This SVG is the location panel: a pin on plaster, with walking-minute
 * chips overlaid in MapSection and the named facts listed underneath.
 */

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" aria-hidden="true">
  <rect width="800" height="400" fill="#f1ede3"/>
  <g fill="none" stroke="#e4e0d6" stroke-width="8">
    <path d="M0 120 H800"/>
    <path d="M0 260 H800"/>
    <path d="M180 0 V400"/>
    <path d="M520 0 V400"/>
  </g>
  <g fill="none" stroke="#d4cfc3" stroke-width="4">
    <path d="M0 190 H800"/>
    <path d="M350 0 V400"/>
  </g>
  <path d="M400 148c-28 0-50 20-50 48 0 38 50 86 50 86s50-48 50-86c0-28-22-48-50-48z" fill="#4a5d3a"/>
  <circle cx="400" cy="196" r="16" fill="#fbfaf7"/>
</svg>`;

export function mapCardSrc(): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SVG)}`;
}

export function wazeNavigateUrl(lat: number, lng: number): string | undefined {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}
