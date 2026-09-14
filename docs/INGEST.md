# Ingestion, geocoding, and walking times

**Deferred until an agent asks for the map.**

The code in `ingest/`, the PostGIS RPCs, and the enrichment UI on the listing
page still exist. They are not on the publish path. Nominatim is not running.
OSRM is not running. The scheduled jobs have never executed against production
data (`docs/DATA-SOURCES.md`, `docs/PIPELINE.md`).

This is deliberate. The market rejected enrichment as the headline (CLAUDE.md
§1, 11 September 2026). Reversing a demotion is an afternoon. Standing up a
geocoder, a routing graph, and three scheduled ingests is not.

`web/src/lib/listing-from-row.ts` does not join `listing_enrichment`. Demo
fixtures in `web/src/lib/listings.ts` still render schools, transit and OSM so
the UI does not rot. A real published listing omits empty groups, which is
the correct empty state (CLAUDE.md §7).

## When an agent asks

Do these in order, one source at a time (CLAUDE.md §13):

1. Address normalisation / Nominatim (or GovMap) for the listing pin.
2. OSRM foot profile — never Google Distance Matrix, never straight-line
   walking time (CLAUDE.md §2).
3. `npm run sync:schools --prefix ingest`
4. Transit, then places, each when the previous feed is actually loaded.

Do not scrape Madlan, Yad2, or any commercial portal.
