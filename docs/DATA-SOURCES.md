# Data sources — reconnaissance

What was actually queried, what came back, and what it changes. Groundwork for
Stage C (RESEARCH.md §10 asks for exactly this before a week of ingestion
work).

**Measured 9 September 2026** against the live `data.gov.il` CKAN API. Record
counts and field names below are copied from real responses, not from
documentation. Where something was NOT tested, this file says so.

---

## Vehicle — reachable, and richer than the brief assumed

Three datasets, and the product needs all three. No WAF block was encountered
on any of these calls, contrary to the warning in the brief — but the calls
made were plain `package_search` and `datastore_search` GETs from a server, so
that is not evidence the WAF is absent, only that it did not fire here.

### 1. Vehicle registry — `053cea08-09bc-40ec-8f7a-156f0677aff3`

Dataset `private-and-commercial-vehicles`. **4,176,978 rows.** Keyed by
`mispar_rechev` (the plate).

Fields that map to our schema:

| Register field | Our fact | Note |
| --- | --- | --- |
| `tozeret_nm` | יצרן | |
| `degem_nm`, `kinuy_mishari` | דגם | `kinuy_mishari` is the commercial name and reads better |
| `shnat_yitzur` | שנתון | |
| `sug_delek_nm` | סוג דלק | |
| `tokef_dt` | טסט עד | |
| `baalut` | בעלות קודמת | current ownership type |
| `tzeva_rechev` | צבע | **see finding 1** |
| `degem_cd`, `tozeret_cd` | — | join keys into the model catalogue |

Also carries `mivchan_acharon_dt` (last test), `misgeret` (VIN),
`kvutzat_zihum` (pollution group), `moed_aliya_lakvish` (first road date).

**`נפח מנוע` is not here.** The registry has `degem_manoa`, an engine model
string, not a capacity in cc.

### 2. Model catalogue — `142afde2-6228-49f9-8a29-9b6c3a0cbe40`

Dataset `degem-rechev-wltp`. **131,732 rows**, 113 fields. Keyed by
`degem_cd` + `tozeret_cd`.

This is where `nefah_manoa` lives — so **engine capacity requires a join**, not
a single lookup. It also carries a great deal we are not currently asking for:
`koah_sus` (horsepower), `mispar_dlatot` (doors), `mispar_moshavim` (seats),
`automatic_ind`, `nikud_betihut` (safety score), `madad_yarok` (green index),
and a full emissions panel.

### 3. Ownership history — `bb2355dc-9ec7-4f06-9c3f-3344672171da`

Dataset `shinui_mivne`, resource "(2)" as the brief names it. **5,429,381
rows.** Four fields only:

```
_id  mispar_rechev  baalut_dt  baalut
```

A sample row: `mispar_rechev 14817, baalut_dt 202202, baalut פרטי`.

---

## Findings that affect the schema

### 1. צבע is verifiable, and the brief marks it seller-declared

`tzeva_rechev` is in the registry, and an Israeli colour change must be
re-registered, so the register is authoritative.

**Not changed.** BUILD-PROMPTS Stage A3 states the source column explicitly and
those values are spec, not inference. Flagged for a decision — moving צבע to
`verified` is a one-line schema change and would put a ninth field behind the
מאומת marker.

### 2. תיבת הילוכים is only partly verifiable

The model catalogue has `automatic_ind`, a boolean. Our enum is four-way:
אוטומטית · ידנית · רובוטית · טיפטרוניק. A boolean cannot fill it faithfully,
and filling three of the four values from a guess would be exactly the kind of
false precision §4.7 forbids.

**Leave as seller-declared.** No decision needed.

### 3. Ownership dates are MONTHLY, not quarterly — corrected

RESEARCH.md §4.3 says "ownership dates by quarter". The register returns
`202202`: a year and a month.

`OwnershipPeriod` carried `fromQuarter`/`toQuarter`. It now carries
`fromMonth`/`toMonth`. A field named for a quarter holding a month would have
discarded precision the state publishes, invisibly, at every call site
downstream.

### 4. יד is derived, not a field

Neither register carries a hand number. It is `count(distinct baalut_dt)` per
plate from the history dataset — which means it is only as good as that
dataset's 2017-onward coverage, and a 2012 car will show fewer hands than it
has had.

**This needs a display rule before it ships.** A confidently wrong יד on a page
that advertises itself as verified is worse than no יד at all.

---

## Transit — code written, feed never downloaded

`ingest/src/sources/transit.ts` reads `routes.txt`, `trips.txt`,
`stop_times.txt` and `stops.txt` out of the archive at
`gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip`.

**The archive was never fetched.** The development machine cannot download and
unzip a few hundred megabytes, so:

- the field names come from the GTFS **specification**, not from the Israeli
  export — if the ministry ships a non-standard column, this breaks on the
  first run;
- **how the feed encodes light rail is unconfirmed.** The stage asked for this
  specifically and it is the one thing I could not answer.

`ingest/src/gtfs/mode.ts` maps both the basic route types (0 tram/light rail,
1 metro, 2 rail, 3 bus) and the extended 100–999 hierarchy, because different
Israeli exports have been reported using each.

**It THROWS on an unmapped value rather than defaulting to bus.** That is the
important decision in the file. A default would make the sync succeed and the
red line show up as a bus stop — wrong, silent, and discovered by a reader.
Throwing means the first real sync fails with the exact unmapped number in the
message and someone adds one line.

Two other things worth knowing before the first run:

- **Memory.** `trips.txt` holds millions of rows and the trip→route map has one
  entry per trip. Route ids are interned, so only the keys are new
  allocations, but this is the line that will exhaust a small machine first. If
  it does, stage the join in Postgres rather than shrinking the map.
- **`unzip` must be in the image.** `ingest/Dockerfile` installs it. There is
  no Node zip dependency by choice (CLAUDE.md §2).

---

## Places — code written, extract never downloaded

`ingest/src/sources/places.ts` pulls the Geofabrik Israel and Palestine
extract and reduces it to seven categories: restaurant, cafe, grocery,
pharmacy, park, culture, gym.

**The extract was never downloaded and osmium was never run.** A few hundred
megabytes of protobuf is not something this machine can fetch or process.

Two passes, and the order is the point:

1. `osmium tags-filter` throws away everything we do not display, so pass two
   never sees a power line.
2. `osmium export -f geojsonseq -n` emits one feature per line, which streams.
   `-n` gives ways and relations a centroid — a park is a polygon in OSM, and
   for "how far is the nearest park" its centre is the honest answer.

Reversing that order means exporting all of OSM to GeoJSON and filtering in
Node: minutes of CPU and gigabytes of garbage for the same answer.

**`name:he` is preferred over `name`.** OSM's plain `name` in Israel is often
a Latin transliteration, and a Hebrew page listing "Cafe Landwer" among Hebrew
place names reads as broken. Names that are Latin-only are counted and reported
rather than dropped — a places list that is mostly Latin is a coverage problem
worth seeing, and it would be invisible from the row count.

**ODbL.** The attribution is already seeded in `source_sync` (0007) and travels
into the enrichment payload, so a page cannot render places without the credit.

`osmium-tool` must be in the image; `ingest/Dockerfile` installs it alongside
`unzip`. Neither is an npm dependency, by choice (CLAUDE.md §2).

---

## Geocoding — GovMap evaluated and rejected, Nominatim chosen

The stage asked for an evaluation rather than a pick, and for the GovMap
question to be answered as a verification task. It was.

**GovMap does not publish a server-side REST API.** `api.govmap.gov.il/docs/intro`
documents three integration methods — URL parameters, HTML embedding, and
JavaScript functions. No REST base URL, no endpoint paths, no server-side auth
model. It is a browser SDK, and a scheduled job cannot use it as documented.

**Chosen: self-hosted Nominatim**, on the same Israel OSM extract that OSRM
already requires and `src/osm/extract.ts` already downloads. No new data
source, no new licence, no per-call fee, no dependency on an undocumented
endpoint. A commercial geocoder stays as the fallback if match quality
disappoints — geocoding runs once per listing at publish, so a small per-call
cost is acceptable there in a way it never is for routing.

**Never the public nominatim.openstreetmap.org.** Its usage policy forbids
systematic queries.

### Two refusals worth knowing about

`geocode()` returns undefined rather than a coordinate when:

- the result falls **outside Israel's bounding box** — that means the query
  matched a similar name in another country, and returning it would put a Tel
  Aviv flat's "nearby schools" somewhere else entirely;
- the match type is a **centroid** rather than an address. A `suburb` result
  for "פלורנטין, תל אביב" is the middle of the neighbourhood — a fine answer to
  a different question. Routing from it and printing "4 דקות הליכה" would be a
  fabricated number.

Both are misses, and a miss means the listing publishes with no proximity
enrichment. C8 already requires that to look intentional rather than broken.

### Address normalisation

`src/geocode/normalise.ts` collapses the variant spellings, with the variant
list as executable assertions rather than prose. The headline case:

    שד' ירושלים 12    שדרות ירושלים 12    שד ירושלים 12    שד׳ ירושלים 12

All four now produce one query. Also handled: רחוב/רח׳ prefixes, apostrophe and
gershayim variants from phone keyboards and iOS substitution, invisible bidi
marks that survive copy-paste, flat and floor fragments, junction addresses,
and house numbers with a Hebrew letter suffix.

**Knowingly not handled**, and listed at the foot of that file: misspellings
(no fuzzy matching), Arabic-script addresses, kibbutz and moshav addresses with
no street, building names used instead of numbers, and the second street of a
junction. Each is a miss, not a wrong answer.

**None of this has run against a real geocoder.** No Nominatim instance exists.

---

## Property — NOT TESTED

The Israel Tax Authority נדל"ן database was **not** exercised. Its search
endpoint is a POST against `nadlan.gov.il`, and the tooling available here
issues GETs only.

So nothing in this file supports any claim about property coverage. RESEARCH.md
§10 validations 1 and 3 — how many transactions come back for a real Florentin
address, and how hard address → גוש/חלקה resolution actually is — remain open,
and they are the two that decide whether the property half of the moat exists.

Neither GovMap nor the Planning Administration was tested either.

---

## What this does and does not establish

**Established:** the vehicle side is real. Three datasets, 9.7 million rows
between them, reachable, with the fields the product needs and more.

**Not established:** that a plate lookup returns a *populated* record for any
particular car. Every query above asked for the schema and the row count, and
one sample row. None asked for a specific plate, because no real plate was
available — and Stage C's acceptance criterion is ten of them.

**Not established:** anything at all about property.
