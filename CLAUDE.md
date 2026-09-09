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

---

## 2. Stack — do not substitute

| Layer | Choice |
|---|---|
| Listing pages | **Astro**, static output, no runtime rendering |
| Hosting | **Cloudflare Pages** |
| Editor | **React island** at `/new`, mobile-first |
| Language | **TypeScript**, `strict: true` everywhere |
| Database | **Supabase** (Postgres, Auth, Storage, Realtime, RLS) |
| Spatial | **PostGIS** for proximity queries |
| Routing | **OSRM**, foot profile, self-hosted |
| Worker | **Fly.io** container, Postgres job queue |
| Images | **sharp**/libvips, local, no external API in v1 |
| PDF | **Puppeteer**, in its own Fly process group |
| Payments | **Undecided.** Build behind a provider interface (PRD §6) |

**Verification runs in CI, because it cannot run here.** npm is blocked on the
primary dev machine by endpoint protection, so nothing installs, typechecks,
lints or tests locally. `.github/workflows/verify.yml` is the gate.

`expo` is still a root dependency and `app.config.ts` with it. They anchor the
EAS project in `.eas/workflows/`, which was the original gate until the free
plan's CI minutes ran out on 9 September 2026. Kept as a fallback and as the
only thing that could build a native app if one ever returns. Neither is a
stack choice.

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

### 4.4 Definition of done for any page

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

## 6. Provenance — the trust proposition

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

---

## 7. Billing — read carefully, this is the money

You may build the paywall. **You may not decide entitlement.**

Requires explicit human review before merge — flag every instance in your
summary:

- any code that reads entitlement state and decides what a user can access
- trial eligibility, grace period, expiry
- anything that grants access when a network call fails

**Fail closed.** Unknown or errored entitlement means not paid. Never grant on
network failure. The payments provider is undecided — build behind an
interface with one adapter and say what the interface needs.

---

## 8. Data and security

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

## 9. Licensing

**OpenStreetMap data is ODbL.** Attribution is a licence condition, not a
courtesy: any page displaying OSM-derived data carries it in the footer, in
Hebrew. This is not optional and it is not a to-do.

**Never scrape Madlan, Yad2, or any commercial portal.** Not for schools, not
for anything. Everything needed is available from primary sources at better
quality. If you believe a field is only obtainable from a portal, report it and
leave it out.

---

## 10. How to work

1. **Read `RESEARCH.md` and `PRD.md` first.**
2. **Plan before coding.** For anything beyond a single file, state the plan
   and the files you will touch, then wait for confirmation.
3. **Verify the artifacts a stage depends on before starting it.** On a missing
   artifact: stop, report, build nothing.
4. **Verify before claiming done.** `npm run typecheck` and `npm run lint`, for
   every workspace you touched.
5. **Say plainly what you could not verify.** Never report a number you did not
   measure. npm is blocked on the primary dev machine and there is no Docker,
   no Postgres and no PostGIS — a great deal cannot be run locally, and
   pretending otherwise is the expensive failure.
6. **Never** touch `.env`, commit a credential, or deploy to production.
7. If a requirement is ambiguous, ask one question. Do not guess and build.

---

## 11. Never do these

- A physical `left`/`right` in CSS (§4.1)
- A number outside `<bdi>` (§4.2)
- Hardcode a user-facing string outside `locales/` or a category schema
- Create a Supabase table without an RLS policy
- Decide subscription entitlement without human review (§7)
- Display OSM data without ODbL attribution (§9)
- Scrape a commercial portal (§9)
- Publish a licence plate, or present data as a valuation (§6)
- Render an empty enrichment block instead of omitting it (§6)
- Query an external source at page render time — ingestion is scheduled, the
  page reads only from us
- Claim a task is complete without running typecheck and lint

---

## 12. Commands

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
