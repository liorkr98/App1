# Ingestion, geocoding, and walking times

**Deferred until an agent asks for the map.** Track 6 is documentation of the
turn-on ladder, not a deploy.

The code in `ingest/`, the PostGIS RPCs, and the enrichment UI on the listing
page still exist. They are not on the publish path. Nominatim is not running.
The scheduled jobs have never executed against production data
(`docs/DATA-SOURCES.md`, `docs/PIPELINE.md`).

> **Partly superseded, 16 September 2026.** An agent asked for the area
> description and the walking times, so the neighbourhood half of this now
> runs — just not through this pipeline. `web/src/lib/overpass.ts` asks
> OpenStreetMap for the named places around the listing's street when the
> seller requests a description, and `web/src/lib/routing.ts` routes walking
> times to them. Both cache on the listing row.
>
> **OSRM is deployable now**: `osrm/` holds the service and `docs/OSRM.md` the
> build. Until it is deployed, walking times come from the OSMF's Valhalla.
>
> What is still true, and is the reason the ladder below survives: that path
> queries a public service per address at authoring time, where this one would
> query our own PostGIS in milliseconds. It is the interim, not the plan.

This is deliberate. The market rejected enrichment as the headline (CLAUDE.md
§1, 11 September 2026). Reversing a demotion is an afternoon. Standing up a
geocoder, a routing graph, and three scheduled ingests is not.

`web/src/lib/listing-from-row.ts` does not join `listing_enrichment`. Demo
fixtures in `web/src/lib/listings.ts` still render schools, transit and OSM so
the UI does not rot. A real published listing omits empty groups, which is
the correct empty state (CLAUDE.md §7).

An accessible map, when it is on, is a **static image plus the text address**.
`alt` describes the area, not “map image”.

## When an agent asks — the ladder, in this order

Do these one source at a time (CLAUDE.md §13). Do not skip to step 5.

1. Address normalisation / Nominatim (or GovMap) for the listing pin.
2. OSRM foot profile — never Google Distance Matrix, never straight-line
   walking time (CLAUDE.md §2).
3. `npm run sync:schools --prefix ingest`
4. Transit, then places, each when the previous feed is actually loaded.
5. Join `listing_enrichment` on the **publish** path in
   `listing-from-row.ts` — not before, and not at page-render time against
   an external source.

Do not scrape Madlan, Yad2, or any commercial portal.
