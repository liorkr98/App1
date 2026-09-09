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
