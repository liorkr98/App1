# CLAUDE.md
Project instructions for Claude Code. Read this fully before writing any code.

> **Rewritten September 2026.** This file previously described a Hebrew-first
> React Native base template. RESEARCH.md v2 made the product a website, so the
> stack, the directory structure and the store-compliance rules all changed.
> The React Native template is complete and CI-green at the `react-native-v1`
> tag; it was not deleted, and the next mobile thing should start from it.

---

## 1. What this repo is

A **web product**: Hebrew-first enriched listing pages for the Israeli market.
A seller uploads photos of an apartment or a car and gets back a short,
professional Hebrew page, enriched with verified public data, shareable by
link.

Read `RESEARCH.md` first, then `PRD.md`. Where this file and RESEARCH.md
disagree, RESEARCH.md wins.

**Primary market:** Israel. **Primary language:** Hebrew. **Primary layout:**
RTL. English is a secondary locale, never the design baseline.

**The moat is the data, not the page.** A pretty page is a one-week build for
anyone who wants to copy it. Treat the enrichment layer as the product and the
page as its presentation.

**Product:** סיבוב. **Domain:** hasivuv.com.

**The primary audience is Israeli estate agents, not private sellers.** The
Justice Ministry's public register lists 22,995 licensed brokers with contact
details — a distribution list almost no consumer product starts with. Private
sellers are secondary. When a design decision trades one against the other,
**agents win.**

---

## 2. Stack — do not substitute

| Layer | Choice |
|---|---|
| Listing pages | **Astro**, static output, no runtime rendering |
| Hosting | **Cloudflare Pages** |
| Editor | **React island** at `/new`, mobile-first |
| Language | **TypeScript**, `strict: true` everywhere |
| Database | **Supabase** (Postgres, Auth, Realtime, RLS) |
| Image storage | **Supabase Storage**. Decided 10 September 2026 — see below. |
| Spatial | **PostGIS** for proximity queries |
| Routing | **OSRM**, foot profile, self-hosted |
| Worker | **Fly.io** container, Postgres job queue |
| Images | **sharp**/libvips, local, no external API in v1 |
| PDF | **Puppeteer**, in its own Fly process group |
| Payments | **Undecided.** Build behind a provider interface (PRD §6) |

**Whether verification can run locally depends on which machine you are on.**
This project is developed from two.

| Machine | npm | What to do |
|---|---|---|
| **macOS** | works | Verify locally first. CI confirms. |
| **Windows** | blocked by endpoint protection | Nothing installs, typechecks, lints or tests. CI is the only gate. |

`.github/workflows/verify.yml` remains the authority on both — a green local
run is evidence, not a substitute, because CI is the environment the deploy
builds from.

**On macOS, verify before claiming done.** At the root: `npm run typecheck`,
`npm run lint`, `npm run test` (142 tests). In `web/`: `npx astro check` and
`npm run build`. Then the gates in `scripts/` — `verify-web-logical-props`,
`verify-bdi`, `verify-motion-fallbacks`, `verify-template-divergences`, and
`report-page-weight`. Confirmed working 10 September 2026.

Two macOS setup traps, both of which look like something else:

- `npm install` in `web/` leaves esbuild's postinstall unapproved and `astro`
  then fails at build time. Run `npm approve-scripts esbuild` once.
- macOS has **no `timeout` command**. A backgrounded `timeout … npm install`
  exits 0 having installed nothing, which reads as a successful install.

**On Windows, do not claim a number you did not measure.** That is the failure
this section exists to prevent, and it is unchanged.

`expo` is still a root dependency and `app.config.ts` with it. They anchor the
EAS project in `.eas/workflows/`, which was the original gate until the free
plan's CI minutes ran out on 9 September 2026. Kept as a fallback and as the
only thing that could build a native app if one ever returns. Neither is a
stack choice.

### Two exclusions and one decision, each with a tempting wrong answer

**Images live in Supabase Storage.** Decided 10 September 2026, reversing the
R2 choice this section used to record.

The reasoning for R2 still stands and is worth keeping written down: R2 charges
nothing for egress, this is an image-heavy product whose every page is
forwarded to dozens of people, and egress is therefore the cost line that grows
fastest — with success, which is the worst shape a cost can have. Supabase
Storage charges for egress beyond the free allowance.

It was overruled for two reasons. `worker/src/storage.ts` and
`supabase/migrations/0004_storage.sql` already implement the two-bucket model
against Supabase, so R2 was the aspiration and Supabase was the code. And one
vendor holding Postgres, Auth, RLS and the objects means the storage policies
and the row policies are the same policies, written once.

**This is a reversible decision and the egress bill is the thing to watch.**
The buckets are behind `worker/src/storage.ts`; moving them is a change to
that file and the migration, not to the pipeline.

**Never propose Stripe.** It does not support ILS as a base currency for an
Israeli business: they cannot settle to a shekel account directly. Israeli
sellers also need Bit, local instalments, and a compliant tax invoice per
transaction, none of which Stripe provides. The provider will be an Israeli
PSP.

**Never Google Distance Matrix, and never straight-line distance as a
substitute for routing.** Distance Matrix is a per-listing cost forever, and
fixed enrichment cost is this product's main economic advantage over the
previous plan. Straight-line distance lies in Israel — a motorway or a wadi
turns 300 metres into a twenty-minute walk, and the buyer discovers that on
foot. The exclusion is written down because the fallback is tempting on the
day OSRM is inconvenient.

Do not introduce a dependency without asking. Justify: what it does, size,
last publish date, and why the stack above cannot do it.

---

## 3. Directory structure

```
src/
  types/          shared domain — imported by web/ via @/
  features/
    listings/schemas/   category fact schemas. Hebrew labels live here.
web/              Astro. Its own package.json, tsconfig and lint pass.
  src/pages/a/[slug]/   the listing page
  src/components/       one concern each
  src/lib/              formatting, facts, enrichment queries
worker/           Fly container: image enhancement, OG, PDF
ingest/           Fly scheduled jobs: schools, GTFS, OSM
supabase/
  migrations/     numbered, append-only. Never rewrite an applied migration.
locales/
  he.json         source of truth
  en.json         same keys, empty values
docs/             ADRs and the records that outlive a stage
```

`web/`, `worker/` and `ingest/` are deliberately **not** npm workspaces. Making
the root a workspace root would rewrite their dependency trees.

`ingest/` sets `rootDir` to the repo root so it can import the payload types
from `src/types/`, which is also what `web/` renders — the shape written and
the shape displayed cannot be allowed to drift. The cost is a nested
`dist/ingest/src/` output, which is spelled out in its tsconfig rather than
left to tsc's inferred root.

---

## 4. RTL — the most important section in this file

Hebrew RTL bugs are the #1 quality problem here. These rules are not
suggestions. This is HTML and CSS, not React Native — the old `marginStart`
rules are gone with the app.

### 4.1 Logical properties only

`html { direction: rtl }`, and then **never a physical side in CSS**:

```
BANNED    margin-left  margin-right  padding-left  padding-right
          left  right  border-left  border-right  float
          text-align: left  text-align: right

USE       margin-inline-start  margin-inline-end
          padding-inline-start  padding-inline-end
          inset-inline-start  inset-inline-end  inset-inline
          border-inline-start  border-inline-end
          text-align: start  text-align: end
```

`scripts/verify-web-logical-props.mjs` fails the build on any of these, and
`scripts/verify-web-lint-fires.sh` plants a violation on every CI run to prove
the check still matches. If you add a rule, add its proof too — a rule that
silently stops firing is worse than no rule.

### 4.2 Every number goes in `<bdi>`

Prices, floors, m², km, סמ״ק, years, phone numbers, dates, ratios, route
numbers. Latin text inside a Hebrew sentence too.

Without it, bidi reordering puts the currency symbol on the wrong end and turns
`03/2027` into something else entirely. It is one tag and it is not optional.

Never string-concatenate a number into a Hebrew sentence — interpolate, so the
formatter runs.

### 4.3 Icons

Two categories; decide per icon, not globally.

**Flip** — direction or progress: back/forward chevrons, arrows, undo/redo,
send, next/previous, progress indicators.

**Do not flip** — objects and universal symbols: logos, play/pause, clocks,
checkmarks, X, magnifier, hamburger, gear, camera, trash, heart, star,
numerals, phone.

When in doubt: does it depict a real object? Then it does not flip.

### 4.4 Drag ordering

**In RTL the FIRST item is the RIGHTMOST. Index 0 is on the right.**

Every model gets this wrong, and the seller only finds out after they have
sent the link — by which point the page has been seen. Photo reordering
carries a test that reorders four photos and asserts the published order
matches what the seller arranged.

### 4.5 Definition of done for any page

Checked in Hebrew with: long Hebrew strings, a mixed Hebrew+English string, a
price, a phone number, and a date. Screenshots in Hebrew, not English.
`/a/_rtltest` is the regression fixture — all ten cases must stay intact.

---

## 5. Hebrew typography

- **Fonts:** Frank Ruhl Libre 500/700 for headlines, prices and numeric facts;
  Assistant 400/600 for body and UI. `font-display: swap`.
- **Line height:** minimum `1.5×`. Hebrew has no ascenders or descenders, so
  tight leading looks cramped.
- **No italics.** Hebrew has no italic form; synthetic italics look broken.
  Use weight or colour.
- **No `text-transform: uppercase`.** Hebrew has no case.
- **No positive letter-spacing** on Hebrew text.
- **Punctuation:** gershayim `״` is U+05F4, geresh `׳` is U+05F3, maqaf `־` is
  U+05BE. Not the ASCII lookalikes. Verify at codepoint level, not by eye.

Design tokens and the visual contract are in `docs/DESIGN-CONTRACT.md`. The
reference HTML files are the contract — port them, do not redesign them.

---

## 6. The WhatsApp preview card

**This is the highest-leverage code in the product.** The page is distributed
by link. If the card is poor nobody taps, and nothing downstream matters.

```
og:image        1200x630, WebP, under 300KB, ABSOLUTE url
og:locale       he_IL
og:title        "<summary> · <price>"
og:description  one line of facts, no marketing language
```

**The content hash goes in the FILENAME, never a query parameter:**

```
/og/{slug}-{hash}.webp
```

Some scrapers strip query strings, and WhatsApp caches previews hard — it will
keep serving a stale card long after the seller has edited their listing.
`?v=2` busts nothing; a new filename is a new resource. This is the difference
between a preview that updates and one that does not, and it is not something
you can discover by reading the code.

---

## 7. Provenance — the trust proposition

Read `PRD.md §5`. Those rules are **legal, not stylistic.**

Two visual classes, never mixed: `מאומת` (public record) and `לפי המוכר`
(seller declaration). Every verified item cites its source body by name and the
date it was current.

- A fact flagged verified with no `sourceName` and `sourceDate` renders as an
  ordinary cell. An unbacked badge is worse than no badge.
- **Never present data as a valuation.** No appraisal, no estimate of worth.
- **Never publish a licence plate.** It is a lookup key only.
- Missing enrichment is normal. A group with no results is **omitted** — never
  an empty block, a placeholder, or an error.

### Absent is not unanswered

| State | Meaning | Renders |
|---|---|---|
| `present: false` | the seller confirmed the feature is absent | greyed at 35%, showing **אין** |
| `value: null` | nobody answered | omitted entirely; the grid reflows |

Collapsing these two turns "we do not know" into "no". That distinction is why
the page reads as a description rather than an advertisement. **Never collapse
them.**

### Indexing is off by default

`robots noindex` by default, controlled by `listing.indexable`, default
`false`. A private seller rarely wants their home address permanently
searchable; an agent wants the organic traffic. **Do not decide for them.**

### Template divergences

Exactly **four** divergences are permitted between the property and vehicle
templates — hero aspect-ratio, `.price-note` content, `section.flaws` (vehicle
only), `section.map` (property only). A fifth is a porting bug.

The full record, with the CSS of each, is `docs/DESIGN-CONTRACT.md` §5, and
`scripts/verify-template-divergences.mjs` asserts it against the built HTML on
every CI run.

---

## 8. Billing — read carefully, this is the money

You may build the paywall. **You may not decide entitlement.**

Requires explicit human review before merge — flag every instance in your
summary:

- any code that reads entitlement state and decides what a user can access
- trial eligibility, grace period, expiry
- anything that grants access when a network call fails

**Fail closed.** Unknown or errored entitlement means not paid. Never grant on
network failure. The payments provider is undecided — build behind an
interface with one adapter and say what the interface needs.

### The product rules

**The free tier is create and preview only. Publishing requires payment.** The
seller goes through the whole flow and sees their finished page — that is the
conversion moment — but cannot share a link until they pay. A free published
page would be the entire product given away: someone selling one apartment
would take it and never come back.

**Metering is LISTINGS, not images.** Cap images per listing at 25. The user
thinks in listings; our cost is in images; the cap is what bridges the two.

**No free trial on subscription tiers.** A private seller would take the trial,
publish their one listing and churn — cannibalising the single-listing purchase
that is the correct product for them.

**Every published page carries נבנה בסיבוב in the footer**, removable only on
agent tiers. This is the viral loop: a listing page is forwarded to 30–80
people who are by definition interested in buying something. Small, elegant,
clickable. Not obnoxious and not invisible.

---

## 9. Data and security

- **RLS is mandatory** on every Supabase table. A table without a policy is a
  data leak.
- The service-role key bypasses RLS. It lives in Fly secrets, never in the
  repo, never in a client bundle, never in a `PUBLIC_` variable.
- **Strip EXIF before publishing any image.** GPS in a photo of someone's home
  is a privacy leak even when the page is noindex and the seller hid the
  street.
- Never log PII. Scrub before send.
- Job payloads carry client-supplied paths and the worker reads them with the
  service role — always validate that a path is inside the listing it claims.

---

## 10. Licensing

**OpenStreetMap data is ODbL.** Attribution is a licence condition, not a
courtesy: any page displaying OSM-derived data carries it in the footer, in
Hebrew. This is not optional and it is not a to-do.

**Never scrape Madlan, Yad2, or any commercial portal.** Not for schools, not
for anything. Everything needed is available from primary sources at better
quality. If you believe a field is only obtainable from a portal, report it and
leave it out.

---

## 11. How to work

1. **Read `RESEARCH.md` and `PRD.md` first.**
2. **Plan before coding.** For anything beyond a single file, state the plan
   and the files you will touch, then wait for confirmation.
3. **Verify the artifacts a stage depends on before starting it.** On a missing
   artifact: stop, report, build nothing.
4. **Verify before claiming done.** `npm run typecheck` and `npm run lint`, for
   every workspace you touched.
5. **Say plainly what you could not verify.** Never report a number you did not
   measure. On the Windows machine npm is blocked, so nothing runs there at
   all; on macOS npm works, but there is still no Docker, no Postgres and no
   PostGIS on either — so the database, the ingestion and the worker cannot be
   exercised locally regardless of which machine you are on (§2). Pretending
   otherwise is the expensive failure.
6. **Never** touch `.env`, commit a credential, or deploy to production.
7. If a requirement is ambiguous, ask one question. Do not guess and build.

---

## 12. Never do these

- A physical `left`/`right` in CSS (§4.1)
- Propose Stripe (§2)
- Use Google Distance Matrix or straight-line distance for walking time (§2)
- Collapse `present: false` into `value: null` (§7)
- A number outside `<bdi>` (§4.2)
- Hardcode a user-facing string outside `locales/` or a category schema
- Create a Supabase table without an RLS policy
- Decide subscription entitlement without human review (§8)
- Display OSM data without ODbL attribution (§10)
- Scrape a commercial portal (§10)
- Publish a licence plate, or present data as a valuation (§7)
- Render an empty enrichment block instead of omitting it (§7)
- Query an external source at page render time — ingestion is scheduled, the
  page reads only from us
- Claim a task is complete without running typecheck and lint

---

## 13. Commands

```bash
npm run typecheck      # shared domain
npm run lint           # shared domain + scripts
npm run web            # astro dev
npm run web:build      # astro build
npm run worker:test    # worker unit tests
```

Per-workspace: `npm run <script> --prefix web|worker|ingest`.

Ingestion is run one source at a time, on a schedule, never all at once:

```bash
npm run sync:schools --prefix ingest
npm run sync:transit --prefix ingest   # not implemented — fails with why
npm run sync:places  --prefix ingest   # not implemented — fails with why
```
