# Listing page audit — P0

/* Hallmark · pre-emit critique: P3 H3 E2 S4 R2 V2 */

Baseline of `/a/[slug]` (via the prerendered `/template-check/` copies of the same `ListingPage.astro` tree). **No listing code was changed.** Homepage, dashboard, pricing and entitlement are out of scope.

Audited HEAD: `132af56` on `cursor/redesign-pass-6052` (seven templates, optional price, editor palettes). Screenshots: `docs/screens/p0/`. Fold geometry: `docs/screens/p0/fold.json`.

This document is the gate for P1. It does not propose a rebuild.

---

## 0. How this was measured

| Tool the brief asked for | What ran |
|---|---|
| Playwright MCP, WebKit iPhone 14 / SE | **Not available** in this environment. No `@playwright/mcp`. |
| Chrome DevTools MCP (Lighthouse, Slow 4G trace) | **Not available.** No `chrome-devtools-mcp`. |
| Context7 MCP | **Not available.** |
| Chromium headless + CDP, Python static server on `web/dist/client` | **Ran.** Viewports 390×844, 375×667, 360×780. `deviceScaleFactor: 2`. |
| `npx impeccable detect` on listing sources | **Ran.** 4 findings, 2 on the listing stylesheet. |
| Hallmark `audit` (no edits) | **Ran**, below. |
| `scripts/verify-listing-js-budget.mjs` | **Ran.** 1043 B gz. |
| axe-core / Lighthouse mobile | **Not run** (no Playwright, no DevTools MCP). |
| `prefers-reduced-motion: reduce` pass | **Not captured.** Geometry is from the default motion path. |

Israeli traffic is iPhone-heavy. Chromium-only screenshots **cannot** certify Safari flex, `animation-timeline: view(inline)`, or RTL scroll-snap. Those wait for a machine with Playwright MCP.

LCP numbers below are Chrome CDP `largest-contentful-paint` against **localhost** with DevTools Slow 4G throttling (`1638.4 kbps`, RTT 150 ms, 4× CPU). They are not a Lighthouse lab run and they are not the public origin. Google Fonts **CSS** loaded (906 B); **no `fonts.gstatic.com` files appeared** in the resource log, so the title painted in a fallback face. Do not treat the millisecond values as production LCP.

---

## 1. Fixtures that exist today

There is no `/a/_matrix`. There are not six realistic fixtures. What `/template-check/` prerenders:

| URL | What it actually is |
|---|---|
| `/template-check/A7K2M/` | Holon 4-room demo, template `editorial`, price ₪1,850,000, full enrichment, map on, 4 photos |
| `/template-check/V3M9Q/` | Mazda 3 demo, template `editorial`, book price, flaws list, no street / no map |
| `/template-check/walk/` | A7K2M with room labels so the filmstrip renders |
| `/template-check/{agency,editorial,dark,walkFirst,brochure,linen,studio}/` | **The same Holon listing** with `template` swapped |
| `web/public/a/_rtltest/index.html` | Static RTL checklist, not an Astro route |

Missing vs P1: Tel Aviv full, Holon partial with no map, moshav long title, plate-lookup miss, older car with flaws, sold status, 7-digit already exists on A7K2M, 300-character agent description does not (A7K2M’s body is generated area copy), custom highlights, monthly costs, agent photo, licence-verified badge.

Photography: Wikimedia CC0 living-room / car stills. The property cover is a tufted European lounge, not tile + shutters + mamad. The vehicle cover is a **Bravo Telecom wrap**, not a private Mazda 3. That is a P1 input problem, not a CSS problem.

---

## 2. First-screen contract (§4) — measured

On a 390×844 viewport the buyer must see, without scrolling: (1) cover, (2) title + location, (3) **dominant** price, (4) up to three highlight chips, (5) WhatsApp in thumb reach.

Geometry is `getBoundingClientRect` after load. `.price` is the PriceBar serif, not the compact-bar duplicate.

| Fixture @ 390×844 | Cover | Title + place | Dominant `.price` | Chips | WhatsApp |
|---|---|---|---|---|---|
| A7K2M / editorial / walk / linen / studio / brochure / dark / agency | yes | yes | **no** (top 862–884, below 844) | **none** | yes, but see overlap |
| V3M9Q (hero 64svh) | yes | yes | **yes** (top 693, fully in) | **none** | yes, **twice** |
| walkFirst | tour photo, not the cover-as-hero | listing title **absent** | **no** (top 1132) | **none** | dock only |

Same pattern at 375×667 and 360×780 for every property template: `.price` is below the fold. Compact-bar *does* show a smaller price in the last ~60 px of the property first screen, sitting **under or against** the fixed dock.

### The overlap (critical)

`.compact-bar` is `position: sticky` **in document flow immediately after the 84svh hero**, not a scroll-driven bar that appears after the hero leaves. `.cta-dock` is `position: fixed` at the bottom on every unsold page.

On **375×667** they collide. The compact WhatsApp label is painted, then the dock button covers it. Screenshot: `docs/screens/p0/A7K2M-375-first.png`.

On **390×844** the compact row occupies the last strip of the viewport; the dock’s olive fill peeks through as a second bar. Two WhatsApp buttons, two prices, no chips, no PriceBar.

`body { padding-bottom: 7rem }` is meant to clear the dock for **later** sections. It does not keep the in-flow compact-bar off the dock on the first screen.

### Why every property template fails the same way

`BaseListing.astro` sets `--heroH` **inline** from `CATEGORY_PRESENTATION` (`84svh` property, `64svh` vehicle). Inline beats `html[data-template='agency'] { --heroH: 54svh }` and the editorial / dark / brochure / linen / studio overrides. Measured `heroH` on every property fixture was `84svh`. Template identity on the first screen is colour and title weight, not height.

Agency was specified as the information-dense first screen (short hero, price in view). It currently looks like editorial with a white compact bar. `docs/screens/p0/agency-390-first.png`.

### Highlight chips

Zero matches for `.highlight-chip` / `.chips` / `.hero-chips`. No `highlights` field is read on the listing page. Contract item 4 fails on every fixture.

### Monthly cost

No `.monthly` / `.monthly-cost`. No arnona / va’ad line. Out of the first-screen list, but called out in §5.1 and absent.

---

## 3. Findings by section

Severity: **critical** ships broken or illegal; **major** misses the brief or reads as slop; **minor** taste.

### Agent bar

- Dark strip, name, empty olive circle. Demo seller has no logo and no `licenceVerified`, so the circle is a blank disc. An unbacked badge is correctly omitted. The empty disc still reads as a missing photo. **Major.** `A7K2M-390-first.png`.
- Logo placement CSS exists (`bar` / `barWide` / `footerOnly` / `watermark`) but no fixture exercises it. **Minor** (P7 / P8).
- No status ribbon except `.sold-banner` when `status === 'sold'`. No fixture is sold, so `נמכר` CTA swap is untested. **Major** for coverage, not a visual bug on these URLs.

### Hero

- Cover is LCP (`.hero-img`, `fetchpriority="high"`, not lazy). Correct.
- No `object-position` in the listing tree. Agent focal point cannot render. **Major** (P3).
- M1 line-split + mask CSS exists; M6 parallax exists behind `@supports (animation-timeline: view())`. Not verified on WebKit. **Minor** until Safari is driven.
- Negative tracking on `.hero-title` is `-0.015em` (allowed). `.price` uses `-0.02em`, tighter than `docs/DESIGN.md`’s −0.015em cap. **Minor.**
- Linen forces `max-inline-size: 9ch`, so the Holon title becomes three stacked words (`משופצת` / `מהיסוד`). `linen-390-first.png`. **Major** on this fixture; will be worse on a moshav-length title.
- walkFirst hides the hero when rooms exist. First screen is the tour, with no price and no listing title. `walkFirst-390-first.png`. **Critical** vs §4.

### Price row

- Dominant serif price exists, and `price === 0` is omitted (optional-price pass). Good.
- It sits **below** the property hero on all three phones. **Critical** vs §4.
- Compact-bar duplicates it and then sticks, so scrolling to `.price-bar` tucks the real row under a second price. **Major.**
- No `החל מ־` / `לפי פנייה` modes. **Major** (P8).
- Price per m² renders (`₪19,474 למ״ר`). Good, when the row is on screen.
- Vehicle shows compact price **and** PriceBar **and** the dock on the first screen. Three contact surfaces, two prices. `V3M9Q-390-first.png`. **Major.**

### Highlight chips

- Not implemented. **Critical** vs §4.

### Facts

- Serif numerals, `--absent` solid colour (not opacity), `value: null` omitted. `אין` / מחסן visible in `A7K2M-390-description.png`. This part of §7 already ships.
- Editorial template sets `.facts { grid-template-columns: 1fr }`, so the Holon demo is a **long centred column**, not a 3-up scan. Israeli scan order (rooms → m² → floor → lift → parking → mamad) becomes a scroll. **Major.**
- Floor cell `3 / 5` paints as **`5 / 3`**. DESIGN-CONTRACT §7 case 2. Markup is `<bdi>3</bdi> / <bdi>5</bdi>` inside an RTL cell; two separate `bdi` runs reorder. **Critical.** Seen on the in-flow facts screenshot before later recaptures.
- Agency hides `.fact-src` (`display: none`), so `מאומת` citations vanish on that template. An unbacked badge is forbidden; **hiding a backed one** is the other failure. **Major.**
- M3 counts up `data-count` via JS. Mid-animation screenshots showed `53` / `56` m² instead of `95`. HTML still holds the final value; visual lie lasts 700 ms. Price is not counted (correct). Reduced-motion / no-JS not captured this pass. **Major** until those two paths are screenshotted in P4.
- No monthly-cost line under the grid. **Major** (P4).

### Description

- Parenthetical `(הדירה)` via `SectionLabel`. Product contract, Hallmark-eyebrow exception — see §6.
- A7K2M body is the generated neighbourhood paragraph, not seller prose. Reads as a data dump (`7 דקות`, `18 דקות`, …) above the gallery. **Major** fixture problem (P1) and a voice problem if publish keeps filling this slot with the same grounded-area string.

### Photo tour / gallery

- Unlabelled A7K2M: asymmetric gallery, first frame wide. Captions present.
- Labelled `/template-check/walk/`: filmstrip + room chips `(סלון · מטבח · מרפסת)`, next-photo control, thumbs on the **inline-start / right** in the 390 shot. `walk-390-walk.png`. That RTL order looks correct in Chromium; **not verified in WebKit**.
- Not the centre-active carousel (M5 `view(inline)`). `.tour-track` CSS exists; the listing walk is radio + labels. **Major** vs P5.
- No floor-plan chip, no 3D-tour chip. Adding either as a new `<section>` would be a fifth divergence; they must live in this tour. **Major** (P5 / P8).
- Lightbox JS is wired (`listing-enhance.ts`, `<dialog>`). Not click-tested this pass. **Unverified.**
- Vehicle gallery photos include a commercial wrap and a dirty white Bravo van that is not the red cover car. **Major** (P1 photography).

### Enrichment

- Dark inverted block, walk-minutes as the row anchor in Frank Ruhl Libre, group heads, source lines at the foot. Structure already matches §5.1.
- Transit ordering shows light rail (7) above a closer bus (3) in the first three rows — `orderTransit` is supposed to prefer proximity; the sample data’s “not the nearest light rail” case is visible. Worth a P6 check, not a P0 code change.
- Vehicle enrichment is register history, same `section.enrich` (keeps the four-divergence rule). Good.
- Empty-block omit: no zero-enrichment fixture, so P6 cannot be signed off. **Coverage gap.**

### Map

- Property only, static image / area map, omitted without a street. Vehicle has city only — correct.
- Location precision (`exact` / `street` / `area`) is **not in the listing render path**. **Major** (P8).
- Section screenshots of the map were unreliable under the sticky bar; do not trust `A7K2M-390-map.png` filenames from the second capture pass. Geometry in `fold.json` still lists a `section.map` in the page.

### Agent card

- Name + role, empty avatar circle, no `tel:` call button, WhatsApp is only the global dock. Brief wants photo, agency, licence number, verified badge, call, WhatsApp. **Major** (P7).
- Share (M9) not present. **Major.**

### Sticky compact bar / dock / footer

- Compact bar does not wait for the hero to leave. **Critical** vs M7.
- Dock is always on, so the compact WhatsApp is redundant and, on small phones, covered. **Critical.**
- Footer: `נבנה בהיעד`, ODbL when attributions exist, accessibility link. Structure is right. **Minor:** five legal links in a row is denser than a listing footer needs, not the SaaS four-column tell.

### Vehicle / flaws

- `section.flaws` is a tinted list with olive dots, not a calm labelled row per disclosure. Not alarming-red. P10 still owes it a real design. **Major.**
- No licence plate in the demo render (plate is a lookup key only). Not grepped on `dist/` this pass. **Unverified** as a CI grep; P10 must do that.

---

## 4. Contrast table

WCAG 2.0 relative luminance, computed from the hex in `tokens.css` / `listing.css` / `accents.ts`. Not sampled from pixels over photographs.

| Pair | Ratio | AA body 4.5:1 | AA large 3:1 |
|---|---|---|---|
| `--ink` `#191A15` on `--plaster` `#FBFAF7` | 16.77 | pass | pass |
| `--muted` `#6E6F66` on plaster | 4.87 | pass | pass |
| `--olive` `#4A5D3A` on plaster | 6.89 | pass | pass |
| plaster on olive (CTA) | 6.89 | pass | pass |
| `--absent` `#5C5D54` on plaster | 6.39 | pass | pass |
| `--absent` on `--stone-warm` `#F1EDE3` | 5.70 | pass | pass |
| `--absent` on `#FFFFFF` | 6.67 | pass | pass |
| `--muted-warm` `#67685F` on stone-warm | 4.83 | pass | pass |
| `--muted` on stone-warm (the old pairing) | **4.35** | **fail** | pass |
| plaster on `--ink-deep` `#111208` | 18.06 | pass | pass |
| `#9C9D93` on ink-deep | 6.87 | pass | pass |
| token `--olive-lift` `#5F7749` on ink-deep | 3.79 | **fail body** | pass large |
| **live** accent lift `#7E9A62` on ink-deep (what the page uses) | 6.00 | pass | pass |
| `.source` `#83847B` on ink-deep | 4.98 | pass | pass |
| `#83847B` on dark-template `--stone-warm` `#1D1F16` | **4.41** | **fail** | pass |
| dark `--muted` `#A3A498` on `#14150F` | 7.27 | pass | pass |
| agency muted `#6B6259` on `#FFFFFF` | 5.97 | pass | pass |
| linen muted `#6D5844` on `#F4E6CF` | 5.45 | pass | pass |
| ochre base `#8A6A1F` on plaster | 4.83 | pass | pass |

Notes:

- Confirmed-absent no longer uses opacity. The `--absent` stop clears 4.5:1 on plaster, stone-warm and white. This is already tested in `src/features/design/tokens-contrast.test.ts`.
- `--olive-lift` in `tokens.css` (`#5F7749`) is **not** what listing pages paint: `html[data-template]` remaps `--olive-lift` to `--accent-lift` (olive default `#7E9A62`). Walk-minute type on the enrichment block is the live lift, 6.00:1, body-legal. The 3.83:1 comment in `listing.css` is stale relative to the accent pipeline.
- Dark template still special-cases `.source` because the literal `#83847B` fails on that template’s lighter dark ground (4.41:1). The override to `var(--muted)` is the fix; keep it.
- Hero title is plaster over a gradient over a **photo**. Token contrast does not certify the light sky behind the Holon lounge. The title sits in the 0.9 veil stop on this cover; a beach/balcony cover with a light focal point will fail. P3 must measure title-over-photo, not title-over-ink-deep.
- Studio `.fact-lbl` at `rgba(251,250,247,.72)` was approximated at ~11:1 on `#141310`. Pixel-sample in P2 if the chips stay.

---

## 5. Performance (what was actually measured)

Listing JS budget, CI script, after `web/dist` build:

```
listing JS budget: 1043 bytes gz (limit 12288)
  92   _astro/BaseListing.astro_astro_type_script_index_0_lang.*.js
  951  _astro/listing-enhance.*.js
```

Under the 12 KB gz cap. Vanilla. No animation library.

LCP, Chromium headless, 390×844, localhost + Slow 4G emulation:

| Page | LCP element | LCP ms (local) | LCP ms (Slow 4G emu) | Hero file |
|---|---|---|---|---|
| A7K2M | `img.hero-img` | 120 | 680 | `/sample/flat-living.webp` 26 KB |
| V3M9Q | `img.hero-img` | 64 | 876 | `/sample/car-front.webp` 65 KB |

Document load (same runs): A7K2M 1496 ms throttled, V3M9Q 1430 ms throttled. Transfer on the throttled property run, uncompressed because `http.server` does not gzip: CSS 31.5 KB, hero 26 KB, enhance JS 2.3 KB, Google Fonts CSS 0.9 KB. Gallery images lazy; not in the first response.

**Not measured:** Lighthouse performance / accessibility scores, CLS, Slow 4G on the public host, font-file bytes, total page weight after opening the lightbox, WebKit LCP.

Production will add: gstatic font files (Frank Ruhl 400/500/700/900 + Assistant 400/600/700), Cloudflare TTFB, real cover photos much larger than 26 KB. 680 ms LCP on a 26 KB localhost image does **not** imply LCP < 2.5 s on Slow 4G with a 200 KB cover.

Privacy (Amendment 13): the page requests `fonts.googleapis.com` at render. That is a third-party connection on every listing. Flag for P12 / a self-host pass; not fixed here.

---

## 6. Hallmark audit (no edits)

Genre: editorial listing, not a SaaS landing page. Macrostructure is a single-column document. `design.md` is not at the repo root; `docs/DESIGN-CONTRACT.md` is the locked listing system.

### Critical

| Tell | Where | Fix (do not do in P0) |
|---|---|---|
| Template first screens are the same shape | `BaseListing.astro` inline `--heroH` overrides every template | Let template tokens win, or move height into the token set without inline |
| Sticky + fixed CTA collision | `.compact-bar` + `.cta-dock`, `A7K2M-375-first.png` | Compact bar must be M7 (after hero leaves), one WhatsApp |
| Missing first-screen price / chips | PriceBar below 84svh; no chips | P3 |
| Floor `5 / 3` | `FactsGrid.astro` paired `<bdi>` | One `<bdi>` around the whole `3 / 5` |
| walkFirst drops title + price | `listing.css` hero `{ display:none }` | Keep §4 on that template or drop walkFirst from the first-screen claim |
| Pure white paper | `html[data-template='agency'] { --plaster: #ffffff }` | Tint toward plaster / stone |

### Major

| Tell | Where | Fix |
|---|---|---|
| Side-tab / side-stripe | `listing.css` studio + agency `border-inline-start: 6px` (Impeccable `side-tab`) | Hairline or a small accent mark, not a 6px rail |
| Eyebrow on every section | `SectionLabel.astro` `(הדירה)` `(גלריה)` `(מסביב)` `(מיקום)` `(המתווך)` | **Product exception** — brief §8 replaces Latin uppercase with these. Do not delete in a Hallmark pass. |
| Centred fact cells | `.fact { text-align:center }` + editorial 1-col | Start-aligned scan, 2–3 columns on agency/editorial as designed |
| Identical section padding | `section { padding: 2.4rem var(--gut) }` | Brief §8: tight after hero, open before enrichment, tight in the agent card |
| Duplicate price / WhatsApp | compact-bar in flow + PriceBar + dock | One dominant price, one thumb CTA, compact after hero |
| Empty avatar discs | `.agent-bar .dot`, `.seller .avatar` with no image | Omit the disc when there is no logo / photo |
| Agency hides provenance | `.fact-src { display:none }` | Provenance is legal, not a density knob |
| Specimen-adjacent huge serif + labelled sections | hero 900 / parentheticals | Allowed by the listing brief; do not restyle into Specimen *and* do not strip the labels |

### Minor

| Tell | Where | Fix |
|---|---|---|
| Variety drift across templates | First screens of agency / editorial / brochure / dark | Dead `--heroH` (see critical) |
| Carded agency facts | `border-radius: 10px` on `.fact` | Density can stay without boxing every cell |
| Circular brochure gallery thumbs | `border-radius: 50%` | Easy to read as decoration |

**Count: 6 critical · 9 major · 3 minor** (Hallmark tells only). Product-contract gaps in §3 are additional.

Hallmark axes on the **current** page, not on this document: Philosophy 3, Hierarchy 3, Execution 2, Specificity 4, Restraint 2, Variety 2. Execution / Restraint / Variety are below the phase-end floor of 3. They cannot be raised without P3–P7. This audit does not restructure section order.

---

## 7. Impeccable detect

```
npx impeccable detect web/src/components web/src/layouts
  web/src/styles/listing.css web/src/styles/tokens.css web/src/styles/walk.css
  web/src/pages/a web/src/pages/template-check
```

4 findings:

1. `web/src/components/editor/PhotosStep.tsx` — `broken-image`. **Out of listing-page scope.**
2. `web/src/layouts/Plain.astro` — `flat-type-hierarchy`. **Out of listing-page scope.**
3. `web/src/styles/listing.css:1160` — `side-tab` (studio price-bar `border-inline-start: 6px`).
4. `web/src/styles/listing.css:1201` — `side-tab` (agency price-bar `border-inline-start: 6px`).

Listing-page detector is not zero. Both remaining hits are the 6px accent rail. Justify or remove in P2 / P3.

---

## 8. Control surface (§7) vs what renders

| Control | Renders on `/a/[slug]` today? |
|---|---|
| Template (7 ids, not 3) | Partial: token sets exist; `--heroH` inline kills height; agency/editorial/dark/linen/studio are distinguishable mostly below the fold |
| Accent (6 presets) | Yes, via inline `--accent` |
| Logo placement | CSS only; fixtures all default `bar` with no logo |
| Cover + focal point | Cover yes, focal point **no** |
| Photo order / room / caption | Order + caption + room (walk) yes |
| Floor plan chip | **No** |
| Headline | `listing.title` yes, ≤60 not enforced here |
| Highlights ≤3 | **No** |
| Price display exact / from / on request | Exact only |
| Status ribbon + sold CTA | Sold banner CSS exists; untested; no “נכסים נוספים” swap |
| Location precision | **No** |
| Section visibility | Omit-if-empty for map / enrichment / disclosures; no agent flags |
| WhatsApp prefill | Category default string, not `{address}` token from the row |
| Secondary CTA call | **No** `tel:` |
| 3D tour URL | **No** |

The published page is already a function of the listing row (not a live profile read). The row simply does not yet hold most of §7.

---

## 9. What already matches the brief (do not rip out)

- One component tree, `dir="rtl"`, logical properties, CI lint that plants a violation.
- Numbers generally in `<bdi>` (floor ratio is the hole).
- `--absent` solid colour, `present: false` vs `null`.
- Four category divergences still encoded in `category-presentation.ts` + data-driven PriceBar / flaws / map.
- Parenthetical Hebrew section labels.
- Motion tokens `--ease-out`, `--dur-*`, `--dir: -1`.
- JS budget enforced, 1043 B gz, counters + lightbox only.
- Enrichment inverted block with minutes as the anchor and sources at the foot.
- ODbL carried on the listing when OSM attributions exist.
- `robots noindex` unless `indexable`.
- Hero is the LCP element and is not lazy.

---

## 10. P1 inputs this audit needs

The page looks empty and generic partly because **both demos are the same apartment in seven palettes, plus one mis-photographed car**. P1 should land before P3 is judged:

1. Six fixtures as specified (three property, three vehicle), including sold, zero enrichment, full enrichment, long title, 300-character description, missing room label.
2. Photography that reads as Israeli homes and private cars, with `CREDITS.md`.
3. `/a/_matrix` noindex, every fixture × template.
4. Keep `/a/_rtltest` intact; add the `3 / 5` case as a live listing cell, not only the static HTML file.

---

## 11. Screenshot index

All under `docs/screens/p0/`. Naming: `{fixture}-{viewport}-{part}.png`.

First screens (the contract shots):

- `A7K2M-{390,375,360}-first.png` — property editorial; 375 shows the dock covering compact WhatsApp
- `V3M9Q-{390,375,360}-first.png` — vehicle; price in view; two WhatsApp buttons
- `{agency,editorial,dark,brochure,linen,studio,walk,walkFirst}-{390,375,360}-first.png`

Section / supporting (Chromium, 390):

- `walk-390-walk.png` — labelled photo tour, RTL thumbs
- `A7K2M-390-description.png` — `(הדירה)`, `אין` מחסן, generated area copy
- `A7K2M-390-{hero,agent-bar,compact-bar,cta,footer}.png`
- `V3M9Q-390-{hero,gallery,flaws,description,agent-bar}.png`

`*-full.png` files are present but roughly viewport-tall; do not treat them as full-page captures. A later recapture of enrich/map/seller scrolled incorrectly and some of those filenames now repeat the first screen — trust the first-pass description shots and `fold.json` over those names.

---

## 12. Stop

P0 is an audit. No P1 work in this branch. Accept when the screenshots and this list match what you see; then P1 is fixtures, not tokens.
