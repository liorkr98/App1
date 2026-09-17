# Walking times

A walking time on a listing page is **routed** — a pedestrian router following
the pavement network — or it does not appear. There is no third state, and the
reason is the one CLAUDE.md §2 gives: straight-line distance lies in Israel,
and it lies in the direction that flatters the listing. The Ayalon, a rail
cutting, a wadi, a walled compound: any of them turns 300 metres into a
twenty-minute walk, and the buyer finds out by walking it.

So `AreaPlace.walkMinutes` is optional and absent renders as nothing at all.
No code derives it from the coordinates beside it. The coordinates order
candidates and draw the map; the minutes come from a router.

## Why OSRM was not running

It was never a missing line of code. OSRM answers from a **routing graph held
in memory**, and the graph has to be built from an OSM extract first:
`osrm-extract` with `foot.lua`, then `osrm-partition`, then `osrm-customize`.
That produces a few gigabytes of prepared data, and then a process has to hold
it and answer HTTP.

Nothing in a Cloudflare Worker can host that. So "OSRM is not running" meant
"there is no such service yet", and every walking time on every page was
absent — which was correct behaviour for a page with no router, and looked
exactly like a missing feature.

`osrm/` is that service now.

## Deploying it

```
fly deploy --config osrm/fly.toml --dockerfile osrm/Dockerfile
npx wrangler secret put OSRM_URL        # https://<app>.fly.dev
```

The graph is built at **image build time** and only the finished graph ships,
so a machine boots ready rather than preparing data on first request. The build
is slow and the image is large; both are paid once per data refresh, and for
walking routes the extract goes stale over months, not days.

`osrm-extract` is the memory-hungry step and it runs on Fly's **builder**, not
on the app machine. If the first deploy fails, that is where to look.

Verify with a real route rather than a ping — the process can be up with no
graph loaded, and anything simpler than a route will answer 200 anyway:

```
curl "$OSRM_URL/route/v1/foot/34.781812,32.085338;34.783014,32.087958?overview=false"
```

**None of the figures in `osrm/fly.toml` are measured.** There is no Docker on
either development machine or on the agent VM, so the graph has never been
built here. The memory and size are from OSRM's guidance for a country-sized
MLD graph. CLAUDE.md §11: do not report a number you did not measure.

## What runs until then

`web/src/lib/routing.ts` prefers `OSRM_URL` and falls back to **Valhalla on the
OpenStreetMap Foundation's instance**, pedestrian costing. One matrix request
per listing, cached on the listing row, no key to hold. It is a public service
used lightly, and the right answer at volume is the self-hosted graph above.

**Not the OSRM demo server.** `router.project-osrm.org/table/v1/foot/…` answers
200 and returns CAR times: measured against a 370-metre hop in Tel Aviv it said
162 seconds where Valhalla's pedestrian costing said 277. A page claiming three
minutes for a five-minute walk is the precise failure §2 forbids. The profile
is what the graph was built with, not a segment of the URL.

**Not Google Distance Matrix**, for a different reason: a per-listing cost
forever, which is the economics this product exists to avoid.

## What a router is asked

One matrix call per listing: the origin is a point on the seller's street, the
destinations are the named places OpenStreetMap returned around it. At most 36
of them (`MAX_ROUTED_DESTINATIONS`), which is the six per group this product
keeps across six groups.

Results above 25 minutes (`MAX_WALK_MINUTES`) are dropped rather than printed:
past that, "walking distance" is not a useful claim. An unreachable
destination — a pedestrian island with no connection — comes back null and is
dropped too. Null is not zero and must never render as one.

## Where the times appear

- The **description**, when the seller asks for one: "בי״ס ממלכתי ביאליק
  (6 דקות הליכה)". `isGrounded` admits exactly the minutes a router returned,
  so a model cannot round one or invent another.
- The **neighbourhood map** on the listing page: the drawing is geometry and
  the list beside it carries the names and the minutes, each inside `<bdi>`.

## Still missing

Geocoding. The origin is a point on the matched STREET, not the building,
because there is no geocoder: `ingest/src/geocode/index.ts` explains why the
public Nominatim is not an option, and our own is not running. For a paragraph
and a map about a neighbourhood the street is the honest scope anyway — but it
means the times are "from this street", not "from this door", and nothing on
the page should imply otherwise.
