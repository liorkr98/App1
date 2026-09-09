# PRD.md — Enriched Listing Pages

Derived from `RESEARCH.md` v2.0. Scope comes from that document and nowhere
else; where this file and RESEARCH.md disagree, RESEARCH.md wins.

> **This supersedes the v1 PRD.** v1 described a mobile app whose
> differentiator was guided 3D capture. That is deferred (RESEARCH.md §9). The
> differentiator is the public data layer.

---

## 1. Product definition

A web app where a seller — private individual or small agent — uploads photos
of an apartment or a car and gets back a short, professional Hebrew page
enriched with verified public data, shareable by link.

**No app install. No account until publish. No app store.**

### Why web and not an app

A private seller sells an apartment roughly once every seven years and a car
once every four. Asking them to install an app for a one-time task is a
conversion disaster, and it breaks the viral loop the product depends on:
someone receives a listing link in WhatsApp, taps the footer credit, and on web
they are creating in two seconds. In an app they hit a store page, an 80MB
download, and a signup.

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

**This is not an enhancement to be added later. It is the product.** Shipping a
beautiful page without the data layer is shipping Canva.

**In v1 the property half of that is PROXIMITY, not transactions** — what is
around this address rather than what sold in this building. RESEARCH.md §1
still describes transactions as the headline because that is where it is
going; §4.2 records why it is not where v1 starts. The vehicle half is
unchanged and already verified against the registers.

---

## 2. The two categories and their fact schemas

Categories are data, not code. A schema file lists a category's facts in
display order with their Hebrew labels; nothing outside
`src/features/listings/schemas/` names a field. Three fields are required per
category and no more — a required field the seller cannot answer is a form they
abandon.

Every fact carries a **source**: `verified` (a public register filled it) or
`seller` (they said so). See §5 — this is the trust proposition, not metadata.

### Property — all seller-declared

| Label | Type | Notes |
|---|---|---|
| חדרים | number | required |
| מ״ר | number | required |
| קומה | number | paired with the next as `3 / 5` |
| מתוך קומות | number | |
| מעלית | boolean | |
| חניה | boolean | |
| ממ״ד | boolean | |
| מרפסת שמש | number | unit מ״ר |
| כיווני אוויר | enum | צפון · דרום · מזרח · מערב · צפון־מזרח · צפון־מערב · דרום־מזרח · דרום־מערב |
| מחסן | boolean | |
| מצב הנכס | enum | חדש מקבלן · משופץ · שמור · דורש שיפוץ |
| ארנונה | number | unit ₪ לחודשיים |
| ועד בית | number | unit ₪ לחודש |
| תאריך כניסה | date or enum | מיידי · גמיש |

Required: חדרים, מ״ר, and — from the listing itself — a price.

### Vehicle — the source column is the point

| Label | Type | Source |
|---|---|---|
| יצרן | text | **מאומת** |
| דגם | text | **מאומת** |
| שנתון | number | **מאומת** |
| נפח מנוע | number, סמ״ק | **מאומת** |
| סוג דלק | enum | **מאומת** |
| יד | enum: ראשונה · שנייה · שלישית · רביעית · חמישית ומעלה | **מאומת** |
| בעלות קודמת | enum: פרטית · חברה · ליסינג · השכרה · מונית · לימוד נהיגה | **מאומת** |
| טסט עד | date | **מאומת** |
| קילומטראז׳ | number, ק״מ | לפי המוכר |
| תיבת הילוכים | enum: אוטומטית · ידנית · רובוטית · טיפטרוניק | לפי המוכר |
| צבע | text | לפי המוכר |
| מצב הרכב | enum: מצוין · טוב · סביר · דורש טיפול | לפי המוכר |

Required: יצרן, דגם, שנתון.

Eight of the twelve are filled from a licence plate against the Ministry of
Transport registers. The remaining four nobody can check — so the seller says
them and the page says so.

### Three fact states, never collapsed

| State | Renders |
|---|---|
| `value` set | normally |
| `present: false` — seller confirmed absent | greyed at 35%, showing **אין** |
| `value: null` — unanswered | not at all; the grid reflows |

Collapsing the last two turns "we do not know" into "no". That distinction is
why the page reads as a description rather than an advertisement.

Booleans render **יש / אין**, never ✓ / ✗.

---

## 3. Out of scope for v1

Reproduced verbatim from RESEARCH.md §1.

- Guided capture, panorama stitching, 3D tours, 360 spins (deferred, §9)
- Native mobile apps
- Automated posting to Yad2 or Facebook Marketplace — no public API exists for
  either; see §8
- CRM, lead management, contracts
- Generative AI imagery of any kind — see §7.3
- Scraping Madlan, Yad2, or any commercial portal — see §4.1

---

## 4. Locked decisions

| Decision | Rationale | Reversible |
|---|---|---|
| Web only, no mobile app | One-time sellers do not install apps; it breaks the viral loop | Yes, later |
| Astro static for listing pages | Hard performance floor on cellular; SEO | No |
| The data layer is the product | A pretty page is a one-week copy; assembly is months | No |
| Primary public sources only, never portals | Scraping Madlan/Yad2 is a legal and stability risk | No |
| No account until publish; signed edit link | Lowest friction for a one-time seller | Yes |
| Local image enhancement in v1 | Zero variable cost; API seam left open | Yes |
| No generative imagery | Misrepresentation of a real asset | **No** |
| Immersive capture deferred | Upgrade to a page that already earns | Sequenced |

---

## 5. Data provenance rules

Reproduced verbatim from RESEARCH.md §4.7. **These are legal, not stylistic.**

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

### How that lands in the UI

- A verified fact carries a `מאומת` marker plus a citation line:
  `משרד התחבורה · נכון ל־08/2026`.
- Seller-declared facts carry no marker. Marking both classes would be noise;
  the reader only needs to know which figures somebody else stands behind.
- A fact flagged verified with no `sourceName` and `sourceDate` renders as an
  ordinary cell. An unbacked badge is worse than no badge.
- The appraisal disclaimer — `המידע להשוואה בלבד ואינו מהווה שומה` — is
  **not shown in v1**, because v1 displays no valuation data: proximity
  enrichment says what is nearby, never what anything is worth. The string
  stays in `locales/he.json`. It is reinstated, non-dismissibly, the moment
  transaction data returns (RESEARCH.md §4.2).

---

## 5a. What enrichment is in v1

**Proximity: what is around this address.** Not what sold in this building —
that is deferred to v2 and to agents (RESEARCH.md §4.2).

| Group | Source | Licence |
|---|---|---|
| Transit stops, routes, mode | Ministry of Transport GTFS | open |
| Schools and kindergartens | data.gov.il — Ministry of Education | open |
| Food, groceries, pharmacies, parks, culture, gyms | OpenStreetMap, Israel extract | **ODbL — attribution required** |
| Walking minutes for all of the above | OSRM, foot profile, same extract | open |

**Walking time is routed, never straight-line.** A motorway, a rail cutting or
a wadi turns 300 metres into a twenty-minute walk. A page that claims otherwise
loses trust the first time a buyer walks it — and routing is a fixed
infrastructure cost rather than a per-listing one, which is the whole economic
argument of the v2 model.

Rules that follow from §5:

- Every group carries `sourceName` and `sourceDate`. The date is the source's
  `last_synced_at`, so staleness is visible rather than implied.
- Results are capped per category — nearest three to five, plus a count for the
  rest. Nobody reads forty restaurants.
- **A group with no results is omitted.** Never an empty block, a placeholder
  or an error. A moshav has no light rail, and its page must look intentional.
- **ODbL attribution is rendered in the page footer, in Hebrew.** It is a
  licence condition, not a courtesy.
- **Vehicles get no proximity enrichment at all.** A car has no fixed location,
  and pinning one to an address is the theft risk the design already refuses.

---

## 6. Unit economics

Variable cost per listing is real, so there is no unlimited tier.

Photo enhancement done locally with sharp/libvips is effectively free — compute
only. An external API for perspective correction and window pull runs about
$0.30–0.58 per image, so a 15-image listing would cost roughly ₪16. **v1 does
local enhancement only**, with a clean `enhanceAdvanced()` seam so an API can
be swapped in later without touching call sites.

Enrichment queries are free at the source; the cost is ingestion compute and
storage, which is fixed rather than per-listing. This is a significant
advantage of the v2 model over v1.

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

The free tier renders an enrichment **summary** only. The full section is paid.
This is the most consequential paywall decision in the product: the free page
must stay genuinely useful and shareable because it is the viral loop, while
the depth is what converts.

**Payments provider is an open decision.** Israeli buyers strongly prefer local
cards and Bit. Stripe supports ILS but not Bit; Israeli PSPs (Meshulam,
Cardcom, Tranzila, Grow) do. Fees, settlement terms and VAT handling need
Lior's judgement as a CPA before this is locked. Build behind a provider
interface with one adapter.
