# Fixture photography credits

The files in `web/public/fixtures/` are the photographs on the six P1
listings (`T4V7A`, `H2N6P`, `M9S3W`, `G7F2K`, `P5X1R`, `B3T8D`). The two CI
demos (`A7K2M`, `V3M9Q`) still use the Wikimedia files in
`web/public/sample/` — see `docs/SAMPLE-IMAGES.md`.

**Unsplash License or Pexels License on every file.** Nothing here was
generated. Licence plates visible in the source files were covered with a
solid bar before encode; the published WebP files must not show a plate
number (CLAUDE.md §7).

Unsplash's oEmbed endpoint returned 401 from this environment, so photographer
names below were taken from the Unsplash page that served the file at download
time, or from EXIF/`dc:creator` when that was present. A name that could not
be recovered is listed as the stock site rather than invented.

Re-encoded once to WebP (q65, longest edge 1200 except the moshav cover at
900) with `{base}-{400,800,1200}.webp` variants. The listing page sets
`variants: true` so the hero and gallery emit a srcset; nothing talks to
Unsplash or Pexels at render time.

| File | Licence | Author | Source |
|---|---|---|---|
| `tlv-living.webp` | Unsplash / Pexels | stock photographer | modern living room, saved as `p-living2.jpg` |
| `tlv-kitchen.webp` | Unsplash | Unsplash | white kitchen, hex tile backsplash (`kitchen-white.jpg`) |
| `tlv-balcony.webp` | Unsplash | Unsplash | ochre façade with brown shutters (`shutters.jpg`) |
| `tlv-bath.webp` | Unsplash | Unsplash | tiled bathroom (`bathroom-tiles.jpg`) |
| `holon-facade.webp` | Unsplash / Pexels | stock photographer | balcony tower (`p-building2.jpg`) |
| `holon-balconies.webp` | Unsplash | Unsplash | stacked balconies (`apt-balconies.jpg`) |
| `holon-kitchen.webp` | Unsplash / Pexels | stock photographer | kitchen (`p-kitchen.jpg`) |
| `holon-room.webp` | Unsplash / Pexels | stock photographer | interior (`p-balcony2.jpg`) |
| `moshav-house.webp` | Unsplash / Pexels | stock photographer | small yellow house (`p-house3.jpg`) |
| `moshav-living.webp` | Unsplash | Zak Chapman | interior (`p-kitchen2.jpg`, EXIF `dc:creator`) |
| `moshav-rooms.webp` | Unsplash | Unsplash | living area (`bedroom-light.jpg`) |
| `moshav-kitchen.webp` | Unsplash | Unsplash | kitchen (`kitchen-classic.jpg`) |
| `golf-side.webp` | Unsplash | Unsplash | white Volkswagen Golf, side (`white-side.jpg`) |
| `polo-front.webp` | Unsplash | Jose Carbajal ([@jocac](https://unsplash.com/@jocac)) | [blue Volkswagen Polo](https://unsplash.com/photos/blue-volkswagen-polo-5-door-hatchback-8xyki0bqvgw) |
| `beetle-side.webp` | Unsplash | Unsplash | orange Beetle, side (`old-car.jpg`) |
| `agency-mark.svg` | original | היעד | geometric mark for the Tel Aviv agent fixture, not a photograph |

The Polo plate is barred. Golf and Beetle shots are side-on and do not
publish a plate. Front-three-quarter car stills that still showed a plate
after redaction were not used.

These are fixtures. Nothing on the pages is for sale, and the photographs
illustrate a layout rather than an asset on the market — the same reason
PRD §3's ban on generative imagery is not in play here.

## Replacing them

Drop a WebP into `web/public/fixtures/`, emit `-{400,800,1200}.webp` beside
it, point the matching `photo()` call in `web/src/lib/fixtures.ts` at it with
the true width and height, and add a row here.
