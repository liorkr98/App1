# RESEARCH.md — Enriched Listing Pages

**Product research and architecture. Read alongside `CLAUDE.md`.**
Web product. Hebrew-first. Categories: property and vehicle. Israeli market.
Version 2.0 · September 2026

> **v2 supersedes v1.** v1 specified a mobile app whose differentiator was
> guided 3D capture. That is deferred. The differentiator is now the **public
> data layer** described in §4. Immersive capture returns as an upgrade to a
> page that already works, not as a launch requirement.

---

## 1. Product definition

A web app where a seller — private individual or small agent — uploads photos
of an apartment or a car and gets back a short, professional Hebrew page
enriched with verified public data, shareable by link.

**No app install. No account until publish. No app store.**

### Why web, not an app

A private seller sells an apartment roughly once every seven years and a car
once every four. Asking them to install an app for a one-time task is a
conversion disaster, and it breaks the viral loop this product depends on:
someone receives a listing link in WhatsApp, taps the footer credit, and on
web they are creating in two seconds. In an app they hit a store page, an
80MB download, and a signup.

Secondary consequences, all favourable:
- No App Review, no rejections, no D-U-N-S wait. Ship an update in ten minutes.
- No 15–30% platform commission. An Israeli PSP is 2–3%.
- One codebase. The output was always a web page.
- Every listing page is an SEO asset on the same domain.

### The differentiator

A pretty page with photos is a one-week build for anyone who wants to copy it.
**The moat is the data.** A page that knows what sold in this building over the
last two years, or that the car's ownership history is verified against the
Ministry of Transport, is months of assembly work and it compounds.

**This is not an enhancement to be added later. It is the product.** Shipping
a beautiful page without the data layer is shipping Canva.

### Out of scope for v1

- Guided capture, panorama stitching, 3D tours, 360 spins (deferred, §9)
- Native mobile apps
- Automated posting to Yad2 or Facebook Marketplace — no public API exists for
  either; see §8
- CRM, lead management, contracts
- Generative AI imagery of any kind — see §7.3
- Scraping Madlan, Yad2, or any commercial portal — see §4.1

---

## 2. Market position

| Segment | Players | Why they don't serve this user |
|---|---|---|
| Israeli classifieds | Yad2, Facebook groups | A form, not a page. No enrichment, no shareable artifact, no design. |
| Israeli property data | Madlan, WinWin | Portals for browsing. They do not give a seller a page to send. |
| Israeli agent CRM | Nadlan CRM, שת"פ נדל"ן, Scalla | Full CRM, desktop, licensed agents only. Nadlan CRM already ships per-listing pages, AI descriptions and UTM analytics — but only inside a CRM subscription. |
| Global | Zillow 3D Home, FSBO platforms | In the US, Zillow *is* the landing page — free, with a tour, in front of 220M monthly uniques. That is precisely why this product does not exist in English, and precisely why the gap is open in Hebrew. |

**The gap: one seller, one thing to sell, one good link, and context they could
not assemble themselves.**

**Principal risk:** Yad2 building this. Mitigations: move while they are not
there, and hold property *and* vehicles in one tool — Yad2 separates its
verticals, and we sell to the seller, not to the board.

---

## 3. The user

**Private seller — primary.** 35–60, listing on Yad2, shooting on a phone,
writing an unstructured description, wondering why nobody calls. Sharp,
immediate pain. One-time use, so **the pricing model is one-time, not
subscription.**

**Independent agent — secondary, recurring.** Of 22,995 licensed brokers in the
Justice Ministry register, 91% of the 882 towns listed hold fewer than 50
brokers each — meaning most Israeli agents are sole operators in small towns.
They will not buy a ₪300/month CRM. They will buy a ₪129/month tool that makes
them look like a national chain.

---

## 4. The data layer — the core of the product

### 4.1 Source policy

**Never scrape Madlan, Yad2, or any commercial portal.** It violates their
terms, breaks on every markup change, and puts a solo developer opposite a
company with lawyers.

Madlan is itself built on public sources. **Go to the primary sources.** It is
legal, free, and a better moat, because the assembly is the work.

### 4.2 Property sources — PROXIMITY, not transactions

**v1 answers "what is around this address", not "what sold in this building".**

That is a simplification, not a reduction in ambition. The transaction chain is
address → normalise → גוש/חלקה → transactions → match to building: four links,
three of them fragile, and the failure mode of the fragile ones is a
confidently wrong comparable rather than a missing one. The proximity chain is
address → coordinate → what is nearby. One link, and geocoding an Israeli
address is a solved problem.

**data.gov.il (CKAN)** — Ministry of Education institutions: name, supervision
stream, grade span, locality; coordinates in a companion dataset keyed by
סמל מוסד.

**Ministry of Transport GTFS** — transit stops, the routes serving each, and
the mode. Light rail must be distinguishable from bus: proximity to the light
rail is one of the highest-value facts on a Tel Aviv page.

**OpenStreetMap**, Israel extract, in PostGIS — food, culture, parks,
groceries, pharmacies, gyms. Licence **ODbL**, so attribution is required on
any page that displays it.

**OSRM**, foot profile, on the same extract — real walking minutes. Straight
line distance lies in Israel: a motorway, a rail cutting or a wadi turns 300
metres into a twenty-minute walk, and a page that claims otherwise loses trust
the first time a buyer walks it.

#### Deferred to v2 — transactions, and only as an agent-facing feature

Not cancelled. Documented here so the reasoning is not lost.

**Israel Tax Authority — מאגר מידע נדל"ן.** Free, public, no registration.
Every property transaction in Israel is legally required to be reported and
recorded. Searchable by city, neighbourhood, address, block and parcel
(גוש/חלקה), price range and date. The headline feature it would give is *what
actually sold in this building, and for how much.*

**GovMap** — address and גוש/חלקה search, and layered geographic data.

**Planning Administration (מנהל התכנון)** — plans affecting the parcel.
Deliberately last: least mature source, lowest value per unit of work.

When transactions return, so does the appraisal disclaimer in §4.7. It is not
needed in v1 because v1 shows no valuation data at all.

### 4.3 Vehicle sources — the strongest single feature in the product

**data.gov.il — מאגר מספרי רישוי של כלי רכב פרטיים ומסחריים.** Official
technical specification by licence plate, covering active private vehicles
from model year 1996 onward and commercial vehicles up to 3,500kg from 1998
onward.

**gov.il — מאגר היסטוריית כלי רכב פרטיים (2).** Number of prior ownerships and
ownership *type*, by licence plate, for active private vehicles from 2017
onward, with ownership dates by quarter.

**What this means: the seller types a plate number and most of the form fills
itself** — make, model, year, engine capacity, fuel type, hand, prior ownership
type.

**This is not a convenience feature. It is trust.** An Israeli used-car buyer
distrusts every number in a listing. A page that says the hand and prior
ownership are verified against the Ministry of Transport is something Yad2
does not offer.

### 4.4 Technical notes on data.gov.il

CKAN API, three-step chain: `package_search` → `package_show` →
`datastore_search`. Hebrew query parameters require percent-encoding. A WAF
sits in front and surfaces as `403 Security Violation` on some direct calls.
Result sets beyond roughly 32K offset require cursor paging on `_id`.

### 4.5 Ingestion architecture

Do **not** query government endpoints at page-render time. They are slow,
rate-limited, and occasionally down, and the listing page has a hard
performance floor.

```
scheduled ingestion job  →  normalise  →  our Postgres  →  enrichment API
                                                            ↓
                                              page build (static)
```

The hard part is not fetching, it is **normalisation**:
- Israeli street names appear in many spellings. `שד' ירושלים`, `שדרות
  ירושלים`, `שד ירושלים` are one street.
- Address → גוש/חלקה resolution, since transaction data is parcel-keyed
- Matching a transaction to a building, not just a street
- Freshness policy per source, and honest staleness display

### 4.6 What the page shows

**Property**
- Transit stops, the routes serving them, and real walking time from OSRM
- Schools and kindergartens, with supervision stream and grade span
- Food, groceries, pharmacies, parks, culture and gyms nearby — nearest few
  per category plus a count for the rest
- A short summary: restaurants within 500m, nearest grocery, nearest park

Each group is omitted entirely when it has no results. A moshav listing
legitimately has no light rail, and its page must look intentional rather than
broken.

*Deferred to v2: recent transactions, price per m², planning items.*

**Vehicle** — no proximity enrichment. A car has no fixed location, and
pinning one to an address is the theft risk §5 already refuses.
- Full verified technical specification
- Ownership count and type, marked as verified
- Test validity
- Seller-declared: mileage, condition, defects — clearly separated from
  verified fields

### 4.7 Legal and presentation rules

**Label every field's provenance.** Two visual classes, never mixed:
`מאומת` (public record) and `לפי המוכר` (seller declaration). This distinction
is the entire trust proposition — collapsing it destroys the product.

**State the source and the date** next to any public data. Cite the Tax
Authority or the Ministry of Transport by name.

**Never present data as a valuation.** Comparable transactions are not an
appraisal (שומה). Say so explicitly.

**Do not publish the licence plate.** Use it for lookup, display the derived
facts. A public page pairing a plate with a location is a theft and
plate-cloning risk.

**Require an ownership declaration** before a plate lookup is attached to a
listing. Log it.

---

## 5. Page design

### Reference implementations

`listing-page-template.html` (property) and `listing-page-vehicle.html`
(vehicle) are the visual contract. `rtl-test.html` is the RTL regression
fixture. Port them; do not redesign.

Four permitted divergences between the two category templates:
1. hero aspect-ratio — 4/5 property, 4/3 vehicle
2. `.price-note` content — identical CSS, content differs
3. `section.flaws` — vehicle only
4. `section.map` — property only. A vehicle's location is a meeting area, not
   an address; pinning a car for sale to a home address is a theft risk.

A fifth divergence is a porting bug.

### Structure, with the data layer inserted

```
hero image
price
facts grid              ← buyers scan this before reading anything
description
gallery
── ENRICHMENT ──        ← the new section, and the reason to build this
   property: comparable sales · schools · transit · planning
   vehicle:  verified spec · ownership history · test
map (property only)
seller
sticky WhatsApp CTA
```

Enrichment sits **below** the seller's own content. The seller's material is
what they came to publish; the enrichment is what makes the page worth
forwarding.

### What professional listing pages get right, and what transfers

Compass and Sotheby's use split-panel layouts because buyers process photos
and data simultaneously rather than sequentially. That is a desktop
convention; on mobile it means **facts immediately below the hero**, not after
a long scroll.

The category splits between conversion infrastructure (Zillow, Opendoor) and
brand theatre (Sotheby's, Compass), and pages attempting both execute neither.
**This product is a third thing: credibility infrastructure for a seller with
no brand.**

Performance is a hard floor — 69% of buyers view listings on a phone or
tablet.

### Design tokens

```
--plaster #FBFAF7   --ink #191A15   --olive #4A5D3A
--stone   #E4E0D6   --muted #6E6F66
```

Deliberately not navy-and-gold: every Israeli real estate brand is blue.

Typography: Frank Ruhl Libre 500/700 for headlines, prices and numeric facts;
Assistant 400/600 for body and UI. No italics — Hebrew has no italic form.
No `text-transform: uppercase` — Hebrew has no case.

---

## 6. Architecture

```
Astro app (Cloudflare Pages)
  ├─ /a/{slug}          listing pages — STATIC, pre-rendered
  ├─ /new               editor — React island
  └─ /a/{slug}/pdf      served file, generated at publish

Supabase (Postgres + Storage + Realtime)
  ├─ listings, facts, media, jobs
  └─ enrichment tables: transactions, vehicles, stops, schools

Worker (Fly.io container, 2 process groups)
  ├─ worker: image enhancement (sharp/libvips), OG generation
  └─ pdf:    Puppeteer, concurrency 1
  Queue: Postgres SELECT ... FOR UPDATE SKIP LOCKED

Ingestion (Fly.io scheduled)
  └─ Tax Authority · data.gov.il CKAN · GTFS · GovMap
```

**Listing pages are statically pre-rendered, never server-rendered on request.**
Fast on cellular, indexable, cheap.

### Editor without an account

No account until publish. On publish, the seller gets an **edit link**
containing a signed token, delivered by email. For a one-time seller this is
lower friction than a password and materially better for conversion. An
optional account can be added later for agents managing several listings.

### Data model

```ts
Listing {
  id, slug, category: 'property' | 'vehicle',
  title, description, price, currency,
  facts: Fact[],
  enrichment?: EnrichmentBlock,
  media: { cover: Image; gallery: Image[] },
  location?, seller, template, status,
  publishedAt, expiresAt, indexable: boolean,
  editTokenHash
}

Fact {
  key, label, value, unit?, type,
  present: boolean,       // seller confirmed absent — renders greyed
  required: boolean,
  source: 'seller' | 'verified',
  sourceName?, sourceDate?
}
```

`present: false` (confirmed absent) is distinct from `value: null`
(unanswered). Absent renders greyed; unanswered is omitted. This is why the
page reads as honest rather than as an advertisement. Do not collapse it.

`source` drives the verified/declared visual distinction from §4.7.

---

## 7. Constraints

### 7.1 Distribution

**Yad2** has no public posting API. Automating their web interface violates
their terms, breaks on markup changes, and gets *users* banned.

**Facebook Marketplace** is closed. The Marketplace Partnership Program
requires Meta partner approval and targets partners syndicating inventory
feeds; vehicles and property run through separate dealer and rental programs.
Meta's Content Library API is read-only and restricted to qualified academic
and nonprofit researchers. The tools that do post are Chrome extensions doing
form-fill, explicitly unaffiliated with Meta.

**Therefore the product prepares, it does not post.** Generate per-platform
title and description, copy to clipboard, deep-link out. The durable asset is
the hosted page and its WhatsApp preview.

### 7.2 The WhatsApp preview is the highest-leverage asset

The page is distributed by link. If the preview card is poor, nobody taps and
nothing else matters.

- `og:image` 1200×630, **WebP**, under 300KB, absolute URL
- Content hash in the **filename**, not a query parameter — some scrapers
  strip query strings, and WhatsApp caches previews hard
- `og:locale` `he_IL`

### 7.3 No generative imagery

Reconstruction versus generation. A generated image of a real property is a
property that does not exist — under Israeli consumer protection law that is
misrepresentation, and international practice is converging on mandatory
disclosure.

Tonal enhancement (exposure, white balance, denoise, straightening) is
permitted and needs no label. Any generative edit is out of scope for v1.

---

## 8. Unit economics

Variable cost per listing is real, so there is no unlimited tier.

Photo enhancement done locally with sharp/libvips is effectively free —
compute only. An external API for perspective correction and window pull runs
about $0.30–0.58 per image, so a 15-image listing would cost roughly ₪16.
**v1 does local enhancement only**, with a clean seam (`enhanceAdvanced()`) so
an API can be swapped in later without touching call sites.

Enrichment queries are free at the source; the cost is ingestion compute and
storage, which is fixed rather than per-listing. **This is a significant
advantage of the v2 model over v1.**

Metering is per **listing**, not per image. Cap images per listing at 25.

| Tier | Price | Includes |
|---|---|---|
| חינם | 0 | 1 listing, our footer credit, enrichment summary only |
| מודעה בודדת | ₪79 one-time | full enrichment, no credit, PDF |
| מקצועי | ₪129/mo | 5 listings/month, own branding, analytics |
| מקצועי+ | ₪249/mo | 15 listings/month, premium templates |

No free trial on subscriptions: a private seller would take the trial, publish
their one listing, and churn — cannibalising the one-time product that is
correct for them.

**Payments — open decision.** Israeli buyers strongly prefer local cards and
Bit. Stripe supports ILS but not Bit; Israeli PSPs (Meshulam, Cardcom,
Tranzila, Grow) do. Fees, settlement terms and VAT handling need Lior's
judgement as a CPA before this is locked.

---

## 9. Deferred: immersive capture

Not cancelled — sequenced. It is an upgrade to a page that already works and
earns.

The technology is mature and mostly free. Scaniverse (Niantic) scans in 30–60
seconds and processes on-device in 5–10 minutes at no cost. SuperSplat
(PlayCanvas, open source) added Walk Mode and streaming LOD in March 2026,
making large scenes viable on mobile. Photo Sphere Viewer (MIT) handles linked
panorama tours; `@scaleflex/cloudimage-360-view` handles image-sequence spins
at 36 frames.

**Return to it when:** the page converts, revenue funds the compute, and there
is evidence sellers want it. The likely first step is *importing* a scan
produced by an existing free app rather than building capture — far cheaper,
and it tests demand before investing in the hard part.

---

## 10. Validation before building

1. **Query the Tax Authority database manually** for a Florentin address. How
   many relevant transactions come back, at what granularity, how fresh?
2. **Query both vehicle datasets manually** for a plate you know. How many
   fields populate?
3. **Normalise ten Israeli addresses by hand** to גוש/חלקה. This is the hard
   part of the whole product — find out now how hard.
4. **Publish one page and send it on WhatsApp.** Watch what people do first.

Tests 1–3 determine whether the moat exists. Test 4 determines whether anyone
taps. Nothing else matters until all four are answered.

---

## Sources

- Israel Tax Authority — מאגר מידע נדל"ן, gov.il/he/service/real_estate_information
- data.gov.il — מאגר מספרי רישוי של כלי רכב פרטיים ומסחריים
- gov.il — מאגר היסטוריית כלי רכב פרטיים (2)
- GovMap — govmap.gov.il
- data.gov.il CKAN API chain and Hebrew encoding constraints
- Justice Ministry broker register — 22,995 licensed brokers
- Nadlan CRM, שת"פ נדל"ן, Scalla — Israeli agent CRM landscape
- Zillow 3D Home and US FSBO ecosystem
- Meta Marketplace Partnerships; Meta Content Library access policy
- Photo Sphere Viewer, SuperSplat, Scaniverse — deferred capture stack
