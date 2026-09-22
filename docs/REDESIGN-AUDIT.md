# Redesign audit — Phase 0

**Date:** 22 September 2026.
**Checkout:** `cursor/redesign-audit-6052`, branched from `cursor/ship-listing-launch-6052`.
**Scope:** audit only. No page redesign. No tokens rewrite. No new motion.

This is the Phase 0 deliverable from the Cursor redesign plan (sections 1–4 of that plan, plus the Phase 0 prompt). The plan file itself is not in the repo.

**What this snapshot is.** Listing CSS, homepage, editor and dashboard as they stand on this branch. A later branch (`cursor/map-sold-copy-6052`) already has a richer area map; it is **not** in this tree. Findings below are from files that are here.

**Screenshot references**

| Ref | File | What it shows |
|---|---|---|
| S1 | `docs/redesign-audit/listing-map-placeholder.png` | `web/public/sample/frame.png` — the listing “map” in this checkout. 3 KB of warm grey. |
| S2 | `web/public/sample/flat-living.webp` | Demo cover. Real photograph, not Israeli (Rio de Janeiro, CC0). |
| S3 | `web/public/sample/flat-kitchen.webp` | Demo kitchen. 8.7 KB, reads as a muddy tile. |
| S4 | `web/public/og-home.webp` | Homepage OG card. Same living room as S2, no wordmark, no product. |
| S5 | `docs/redesign-audit/home-mobile.png` | Live homepage, 390×844, `besivov.liorkr98.workers.dev`. Dark hero, hairline grid, MiniScreen facsimile, CTA. Wordmark already **היעד**. |
| S6 | `docs/redesign-audit/listing-mobile.png` | Live demo listing `/a/A7K2M/`, 390×1400. Agent bar `נבנה בהיעד`, 84svh hero, serif title, fixed WhatsApp dock. No section labels, no photo tour. |

Editor `/new` and dashboard `/mine` need a session. Not captured.

---

## Skills — what is installed, what is not

| Skill | Role in the plan | Status in this environment |
|---|---|---|
| **Impeccable** (pbakaus) | Primary design language + `detect` CLI | Detector CLI works via `npx impeccable detect`. `npx impeccable install` **failed** (`invalid zip data`), so the Cursor skill files are **not** in `.cursor/skills`. Future chats will not auto-load `/impeccable` commands until that install succeeds on a machine that can download the zip. |
| **Hallmark** (Nutlope) | Auditor only | Installed to `~/.agents/skills/hallmark`. This audit ran `hallmark audit` by following `references/verbs/audit.md`. **Do not let it redesign** — its structural-variety rules fight the listing contract (plan §0.3). |
| **Taste-Skill** (Leonxlnx) | Motion filter | Installed to `~/.agents/skills/design-taste-frontend`. Filter used below: motion must be motivated by hierarchy, storytelling, feedback, or state change. |

`npx impeccable detect web/src` exited 2 with **9 findings** (2 advisory). Full JSON is summarised in §Impeccable. Focused detect on listing + homepage + dashboard + editor reported only the homepage grid background and em-dash advisory.

**Hallmark is active as a method, not as a Cursor slash command in this repo.** Confirm locally: Agent Skills setting → reload → a trivial “run hallmark audit on /” prompt should pick up the skill.

---

## STOP — plan vs CLAUDE.md / DESIGN-CONTRACT.md

The project rule is: where this plan and CLAUDE.md conflict, **stop and ask**. These are the conflicts. Phase 1 should not paper over them.

| # | Binding text | Plan | Verdict |
|---|---|---|---|
| C1 | `docs/DESIGN-CONTRACT.md` §6.3: listing motion is native CSS only. **“No animation library.”** “If a visual effect here seems to need JavaScript, stop and ask.” | Amend the listing contract to **≤ 12 KB gz vanilla JS** for M3 counters and M4 lightbox. GSAP never on `/a/[slug]`. | **Ask.** The amendment is explicit and the rationale (WhatsApp-tap gallery) is sound, but it is a contract change. Phase 2 must write it into `DESIGN-CONTRACT.md` **and** add a CI gate, or it stays a suggestion. |
| C2 | `docs/DESIGN.md` Motion: **“No scroll-triggered reveals.”** A uniform fade-and-rise ships blank in a headless renderer. | M2 clip-path `animation-timeline: view()`; homepage pinned ScrollTrigger sequence. Listing already has `.reveal` rise under `@supports` + reduced-motion wrappers. | **Ask for marketing.** Listing already does scroll-driven reveal (M-adjacent). Adding more `.reveal` on every section is the thing DESIGN.md banned. Homepage GSAP pinning is new JS on a surface that currently has zero. |
| C3 | `docs/DESIGN.md` Components: **“No eyebrow labels above section headings.”** `DESIGN-CONTRACT.md` §2: Hebrew hierarchy is size, weight, colour — not a Latin label trick. | §4.4 parenthetical labels `(הדירה)` · `(מסביב)` · `(גלריה)` · `(המתווך)` as the section-labelling device for the whole product. | **Ask.** This is the plan’s replacement for tracked uppercase, and Hallmark’s “eyebrow on every section” gate will flag it as major. If you say yes, Phase 1 may add the component; Hallmark must not delete it. |
| C4 | `DESIGN-CONTRACT.md` §8: homepage preview is an **iframe of the real listing** at 320px (the current code instead draws `MiniScreen` CSS facsimiles — already drifted). | Hero phone frame playing a **muted looped screen recording**, not a live iframe. | **Ask.** Plan and current contract disagree; current code matches neither. |
| C5 | Plan §4.5 `--absent: #7A7B72` “must measure ≥ 4.5:1”. | Same hex. | **Internal plan failure.** Measured **4.10:1** on `--plaster`, **3.66:1** on `--stone-warm`, **4.28:1** on agency white. Phase 1 must pick a **darker** stop and prove it. Do not paste the published hex. |
| C6 | CLAUDE.md §1: product name **היעד**. Domain hasivuv.com. | Plan uses היעד. | **This branch** still hardcodes **סיבוב** in `index.astro` (title, `og:site_name`, `.mark`). **Production already shows היעד** (S5, S6 `נבנה בהיעד`). The redesign must not resurrect סיבוב from this checkout. |
| C7 | CLAUDE.md §12: never query an external source at page render. | Plan §6.1 map is a **static image**, omit if absent. | This snapshot’s map is a static grey PNG (S1) — contract-compliant and empty. Later work draws OSM tiles at render time; that is a separate CLAUDE.md argument, not this audit’s to reopen. |
| C8 | CLAUDE.md §8 entitlement is human-review. | Plan does not touch it. | **Aligned.** Do not open `web/src/lib/entitlement.ts` or the publish trigger in this redesign track. |
| C9 | Cloud agent branch rule: `cursor/<name>-6052`. Plan: `redesign/*` only. | — | This audit is on `cursor/redesign-audit-6052`. Cursor and Claude still must not share a branch. |
| C10 | Hallmark “structural variety” + “eyebrow on every section”. | Listing templates are a **fixed contract** (four category divergences). | Plan §0.3 already answers: Hallmark **audits**, it does not redesign `/a/[slug]`. |

**Not a conflict, already true:** olive-not-blue; logical properties + `verify-web-logical-props`; every number in `<bdi>`; no Stripe; no Distance Matrix; no licence plate on the page; `present: false` ≠ `value: null`; ODbL in the footer when OSM-derived data is shown; fail-closed entitlement.

---

## Diagnosis (plan §2) against this codebase

The plan’s five reasons, with evidence.

1. **No real photography — still the largest hole.**
   Demo covers exist (S2–S3, and the hero in S6) and they are real CC0 files, not grey boxes. They are also **not Israeli apartments** (Rio, Salford, Örebro — `docs/SAMPLE-IMAGES.md`). The listing **map in this checkout is a grey rectangle** (S1). Homepage OG (S4) is an unbranded living room. Live homepage (S5) puts that same Rio room inside a CSS phone, which makes the empty-photography problem look like a product demo. Editor template picker is **three text buttons**, no thumbs. A missing photograph still renders `background: var(--stone)` — a finished-looking empty.

2. **Compressed hierarchy — half true.**
   Listing tokens already span ~6× (`--t-label` 0.74rem → `--t-hero` clamp 2.6–4.2rem). Impeccable did **not** flag `listing.css` for flat type. It **did** flag `Plain.astro` (legal), `enter.astro`, `me.astro`. Homepage `--display` maxes at 4.2rem, matching the listing hero, but there is **no `--t-display`** (plan 4.6rem). The eyebrow gap the plan names is real: `.label` exists and is barely used as a section device; `h2` sits on its own.

3. **Uniform rhythm — true on the listing.**
   `section { padding: 2.4rem var(--gut) }` is one rule. Same 620px column. Same hairline language. Enrichment is the one inversion. Homepage does dark → light → tinted → dark, then a three-up template row and a three-up how-to.

4. **No motion, no response — half true.**
   Listing: hero parallax + section `.reveal` + progress line, all CSS, reduced-motion wrapped (this is M6 plus a reveal DESIGN.md told us not to proliferate). CTA already `scale(.97)` on `:active` (M8, listing only). **No lightbox. No counters. No sticky compact bar. No photo-tour scale.** Homepage: 13.5s auto-cycling MiniScreens (Hallmark: auto-rotating carousel with no pause) and CTA `translateY(-1px)` on hover. Editor: press scale on some controls, `transition: color 0.15s ease` (browser `ease`, not the token family). Taste-Skill: cycling templates is not hierarchy/story/feedback/state — it is decoration on a loop.

5. **Hebrew lost the eyebrow — true, and DESIGN.md currently forbids the replacement.**
   See C3.

---

## Impeccable detect (`npx impeccable detect web/src`)

9 findings. Advisory rows do not fail the CLI’s count in quiet mode; they are listed because the plan asked for every finding.

| Severity | Rule | Where | Notes |
|---|---|---|---|
| warning | `flat-type-hierarchy` | `web/src/layouts/Plain.astro:39` | Legal pages. Ratio 1.6:1. Imported by 404, privacy, terms. |
| warning | `broken-image` | `web/src/lib/agency-logo.ts:16` | False positive on a helper that *builds* `<img>` strings. `me.astro` preview logo. |
| warning | `broken-image` | `web/src/lib/images.ts:70` | False positive: `srcset` helper, not a tag with empty `src`. |
| warning | `side-tab` | `web/src/pages/a/[slug]/share.astro:213` | `border-inline-start: 3px solid` on the WhatsApp message preview. Real AI-slop tell. |
| warning | `flat-type-hierarchy` | `web/src/pages/enter.astro:49` | Sign-in. Ratio 1.5:1. |
| advisory | `codex-grid-background` | `web/src/pages/index.astro:160` | `.dark::before` 68px grid-line overlay. Plan §6.2 also bans glass; this is the grid cousin. |
| advisory | `em-dash-overuse` | `web/src/pages/index.astro` | 9 em-dashes in body (comments + copy). Hebrew copy uses `—` legitimately; comments inflate the count. |
| warning | `broken-image` | `web/src/pages/me.astro:426` | `#pv-logo` starts `hidden` with no src until JS fills it. |
| warning | `flat-type-hierarchy` | `web/src/pages/me.astro:66` | Profile. Ratio 1.9:1 across many tiny sizes. |

**Zero findings on `listing.css` / listing components.** The detector’s slop rules are aimed at marketing CSS. That is why Hallmark still has to look at the listing as a page.

**Not flagged, still true:** `--ease-in-out` in `tokens.css` (plan: no bounce, and no `ease-in-out` *defaults* — the token exists and editor photo buttons use raw `ease`). No `translateX(` anywhere in `web/src` today, so the future `--dir` lint has nothing to catch yet.

---

## Hallmark audit

Method: `hallmark audit` per `~/.agents/skills/hallmark/references/verbs/audit.md`. Do not edit. Scores are 1–5 on Philosophy, Hierarchy, Execution, Specificity, Restraint, Variety. Plan: **fix anything under 3** before calling a phase done.

`docs/DESIGN.md` exists (system-managed). No Hallmark stamp on any CSS. Genre of the product is **editorial** (Hebrew magazine listing), not atmospheric — so the homepage radial olive wash + grid overlay is graded as a tell, not as atmospheric décor.

### Homepage `/` — `web/src/pages/index.astro`

**Hallmark · P3 H3 E3 S2 R3 V2** — Variety 2 and Specificity 2 are under 3.

**Structure (critical):** hero (dark, copy + cycling devices) → three equal template devices → three-column how-to at `min-width: 760px` → dark dashboard teaser → closing CTA → footer. That is the AI landing template the plan told Hallmark to catch. Plan §6.2’s narrative (four-minute proof, before/after, what’s around, verified, pricing) is **absent**. S5 is the live proof: grid overlay, MiniScreen chrome, slogan `המודעה שלך, מוכנה לשליחה`, one CTA, no recording.

| Sev | Tell | Where | Fix (one line, not done) |
|---|---|---|---|
| critical | Default-attractor / 3-column feature grid | `index.astro` 1111–1156, `.steps` 757–760 | Replace the how-to triptych and the three MiniScreens-as-features with the pinned proof + one real example. |
| critical | Full-viewport dark hero + decorative field | `.dark` 148–170 | Drop the 68px grid overlay; give the hero a real listing recording, not a texture. |
| major | Re-drawn UI chrome | `MiniScreen.astro` + `.device` cycle 1072–1101 | A muted loop of a real page, not three CSS phones. Hallmark forbids fake device chrome. |
| major | Auto-rotating carousel, no pause | `.cycling` 13.5s loop | Pause control or no loop; reduced-motion already freezes on the first screen. |
| major | Mid-render token improvisation | `:root` `--display/--lead/--dim/--on-dark` in the page, plus `#9c9d93`, `rgba(251,250,247,…)` | One token file. Homepage must not declare a second type scale. |
| minor | CTA hover is a lift (`translateY(-1px)`) | `.cta:hover` 314–318 | Press is scale; hover should not travel. Taste-Skill: unmotivated motion. |
| minor | Footer is two links + domain | 1209–1220 | No `/accessibility`, no `/pricing`. Plan §6.6. |
| minor | Em-dash density | comments in the page | Ignore in Hebrew body; trim comments or the detector stays noisy. |

Missing vs plan §6.2: phone-frame recording, four-minute ScrollTrigger proof, before/after, enrichment explained through one example, verified-licence section, live template minis that are actually the listing templates (they are MiniScreens), pricing strip, accessibility link.

### Listing `/a/[slug]` — `ListingPage.astro` + `listing.css`

**Hallmark · P4 H4 E3 S3 R4 V3** — all ≥ 3. Do **not** Hallmark-redesign this page.

The page already aims at “editorial listing”: 84svh hero, serif numerals, dark enrichment, 620px document. Templates are token sets on `<html data-template>` (`agency`, `editorial` default, `dark`) — that matches plan §6.1’s architecture. Four category divergences are intact.

| Sev | Tell | Where | Fix (one line, not done) |
|---|---|---|---|
| critical (a11y, not slop) | Opacity de-emphasis | `.fact.off … { opacity:.42 }` `listing.css:135` | Solid `--absent` that actually clears 4.5:1 (see contrast table). Composite contrast of אין is **1.70–2.60:1**. |
| major | Every section padded the same | `listing.css:150` `section{padding:2.4rem var(--gut)}` | Vary block padding / full-bleed / inversion; keep the four divergences. |
| major | Gallery is a static grid | `Gallery.astro` | Plan M5 room chips + snap carousel, M4 lightbox. |
| major | Map is empty | `ListingPage.astro:48` `/sample/frame.png` (S1) | Real static map or omit the section (CLAUDE.md §7: missing enrichment is omitted). |
| minor | `.odbl` `#96978E` on plaster | `listing.css:263` | 2.83:1 — fails even large-text. Darken. |
| minor | `--olive-lift` on `--ink-deep` | walk minutes | 3.79:1, large text only. Already in `DESIGN.md`. Do not use for body. |
| minor | No parenthetical section labels | `ListingPage.astro` h2s are `על הדירה` / `מיקום` | Blocked on C3. |
| minor | No verified-licence badge | `SellerBlock.astro` prints the number as seller text | Render `מאומת · פנקס המתווכים` **only** when the register matched. Unbacked badge is forbidden. |
| minor | No sticky compact bar / no lightbox JS | — | Phase 2–3. Current JS on the listing is JSON-LD only (not executable). Budget today: **~0 KB gz**. |

**Taste-Skill on listing motion that already exists:**

| Primitive | Motivated? | Notes |
|---|---|---|
| M6 hero parallax | Storytelling — weak | Keep; already wrapped. |
| `.reveal` rise on sections | Hierarchy — weak | DESIGN.md called this the AI reflex. Do not add more. Hero-only on load is the plan’s global rule. |
| Progress line | Feedback | Decorative (`aria-hidden`). Fine. |
| CTA `:active` scale | Feedback | Keep; extend to every tappable (M8). |
| Homepage template cycle | None of the four | Cut or replace with the recording. |

Hero title is already split by `\n` into lines (`Hero.astro`) but **not** wrapped for a CSS mask reveal (M1). Good hook for Phase 3 without a character split (Hebrew/nikud).

Gallery `alt` is `image.alt ?? ''`. Room labels as alt are Phase 3.

### Editor `/new` — `Editor.tsx` + `editor.css`

**Hallmark · P3 H3 E3 S2 R4 V2** — Specificity 2, Variety 2.

Product-mode (Impeccable) is the right read: a tool, not a brand page. Step flow exists (`stepsFor` in `@/features/listings/editor`). Preview is a scaled facsimile wearing `listing.css` (`PreviewStep.tsx`) — that is the right idea, currently **inline in the step**, not a desktop-right / mobile-peek sheet.

| Sev | Tell | Where | Fix |
|---|---|---|---|
| major | Template picker is three text rows | `TemplateStep.tsx` | Live mini-screens of the three token sets. |
| major | Touch target 30px | `editor.css:386–393` `.shot-controls button` | 44×44. The comment admits the floor. |
| major | Opacity 0.35 / 0.42 | `editor.css:267, 364, 410, 841` | Solid tokens. Same absent-fact bug as the listing. |
| minor | `transition: … ease` | `editor.css:401` | Use `--ease-out` / `--dur-ui`. |
| minor | No stream-in description | `DescriptionStep.tsx` | Phase 5 / 7. Do not put DeepSeek in the client bundle. |
| minor | Entitlement `loadEntitlement` | `Editor.tsx` | **Out of redesign scope** (C8). |

### Dashboard `/mine`

**Hallmark · P3 H3 E3 S2 R4 V3** — Specificity 2.

Dense-ish cards, status filters, dark masthead matching the agent bar. Not a search portal. Good.

| Sev | Tell | Where | Fix |
|---|---|---|---|
| major | Missing the numbers an agent uses | `mine.astro` | Views, WhatsApp taps, grant remaining — plan §6.4. Grant remaining is entitlement-adjacent (C8): display is UX, the trigger stays law. |
| minor | Brand still סיבוב | `.mark` | C6. |
| minor | Flat type vs listing 6× scale | inline styles | Pull tokens; don’t invent a dashboard scale. |

### Legal / missing routes

`/legal/privacy` and `/legal/terms` exist and contain **product-written** Hebrew, not owner-supplied placeholders. Plan §6.6: agent builds pages, owner supplies text. Flag: these texts are already in the tree; do not invent more legal prose.

**Missing:** `/accessibility` (IS 5568 statement), `/pricing` (three tiers, checkout disabled, Bit / חשבונית מס). Footer does not link either.

---

## Contrast table — every text/background pair in `listing.css`

Computed WCAG 2.0 relative luminance. AA body ≥ 4.5:1. AA large (18pt / 14pt bold) ≥ 3:1. **Measured, not eyeballed.**

### Base tokens (editorial)

| Pair | Ratio | AA body | AA large |
|---|---|---|---|
| `--ink` `#191A15` on `--plaster` `#FBFAF7` | 16.77 | ✓ | ✓ |
| `--muted` `#6E6F66` on `--plaster` | 4.87 | ✓ | ✓ |
| `--olive` `#4A5D3A` on `--plaster` | 6.89 | ✓ | ✓ |
| `--plaster` on `--olive` (CTA) | 6.89 | ✓ | ✓ |
| `--plaster` on `--olive-lift` `#5F7749` (CTA hover) | 4.77 | ✓ | ✓ |
| `--on-dark` `#FBFAF7` on `--ink-deep` `#111208` | 18.06 | ✓ | ✓ |
| `#9C9D93` on `--ink-deep` (agent bar, enrich-sub, count) | 6.87 | ✓ | ✓ |
| **`--olive-lift` `#5F7749` on `--ink-deep`** (`.erow .mins`) | **3.79** | **FAIL** | ✓ large only |
| `#83847B` `.source` on `--ink-deep` | 4.98 | ✓ | ✓ |
| **`#96978E` `.odbl` on `--plaster`** | **2.83** | **FAIL** | **FAIL** |
| `--muted` on `--stone-warm` `#F1EDE3` | 4.35 | FAIL | ✓ |
| `--muted-warm` `#67685F` on `--stone-warm` | 4.83 | ✓ | ✓ |
| `--ink` on `--stone-warm` | 14.97 | ✓ | ✓ |
| `--olive` on `--stone-warm` | 6.16 | ✓ | ✓ |

`listing.css` already introduced `--muted-warm` because `--muted` on `--stone-warm` fails. `.seller-role` uses it. `.label` / `.addr` / footer / `.pre-portal` still use `--muted` on plaster (pass) or on stone-warm (fail if they land there).

### Opacity composites — `.fact.off` (`opacity: .42`)

Foreground is blended onto `--stone-warm` then contrasted with that same ground. This is the WCAG result a buyer with low vision gets.

| Composite | Blend | Ratio | AA body |
|---|---|---|---|
| `.fact-val` `--ink` @ 0.42 on `--stone-warm` | `#96948C` | **2.60** | FAIL |
| `.fact-lbl` `--muted` @ 0.42 on `--stone-warm` | `#BAB8AF` | **1.70** | FAIL |
| same value on agency `--stone-warm` `#FAF6F0` | `#9C9A94` | **2.61** | FAIL |
| dark template `--ink` `#F3F1EA` @ 0.42 on `#14150F` | `#72716B` | **3.75** | FAIL (large only) |
| dark `--muted` `#A3A498` @ 0.42 on `#14150F` | `#505149` | **2.29** | FAIL |

**אין is not readable.** Plan §4.5 is right to kill opacity de-emphasis. Its published `--absent: #7A7B72` is **not** the replacement: 4.10 / 3.66 / 4.28 on the three grounds. Phase 1 must measure a darker token (and a light one for the dark template) until body AA holds.

### Agency template

| Pair | Ratio | AA body |
|---|---|---|
| `--muted` `#6B6259` on `#FFFFFF` | 5.97 | ✓ |
| `--muted` `#6B6259` on `#FAF6F0` | 5.55 | ✓ |
| `#9C9D93` on agency `--ink-deep` `#1C1917` | 6.38 | ✓ |
| `--olive-lift` `#5F7749` on `#1C1917` | **3.52** | FAIL body (large only) |

### Dark template

| Pair | Ratio | AA body |
|---|---|---|
| `--ink` `#F3F1EA` on `--plaster` `#14150F` | 16.24 | ✓ |
| `--muted` `#A3A498` on `#14150F` | 7.27 | ✓ |
| `--muted` on `--stone-warm` `#1D1F16` | 6.60 | ✓ |
| `#83847B` on `#1D1F16` (if `.source` were not overridden) | **4.41** | FAIL — already overridden to `--muted` |
| `--olive-lift` fallback `#7E9A62` on `#14150F` | 5.84 | ✓ |
| inverted CTA `--plaster` `#14150F` on `--ink` `#F3F1EA` | 16.24 | ✓ |

Hero veil type is `--on-dark` over a dark gradient; that pair is 18:1 against solid `--ink-deep`. Photograph-dependent, so the veil exists. `.hero-place { opacity:.88 }` is another opacity de-emphasis; at 0.88 on white-on-dark it still clears AA, unlike `.fact.off`.

---

## Motion / JS / dependency change map

What would have to move to implement the plan. **Not a build list for this chat.**

### Tokens (`web/src/styles/tokens.css`) — Phase 1

| Today | Plan §4.5 |
|---|---|
| No `--t-display` | `clamp(2.8rem, 12vw, 4.6rem)` |
| `--t-hero` … `--t-label` already match | keep |
| No `--absent` | new, **but not `#7A7B72`** until a passing hex is measured |
| `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` | `cubic-bezier(.16, 1, .3, 1)` |
| `--ease-in-out` present | plan: one family, no bounce; drop as a default |
| `--press: 160ms` | `--dur-press: 120ms`, `--dur-ui: 240ms`, `--dur-reveal: 700ms` |
| No `--dir` | `--dir: -1` in RTL |
| Homepage redeclares `--display/--lead/--heading/--body/--meta` | kill; one source |
| `docs/SHELL-CONTRACT.md` | does not exist |

Lint: flag `translateX(` without `var(--dir)` under `web/src`. Nothing to flag today.

### Listing primitives — Phase 2 lab, Phase 3 page

| ID | Today | Change |
|---|---|---|
| M1 CSS | Hero lines split on `\n`, no clip | Wrap each line in a span at render time |
| M2 | None | `clip-path` + `animation-timeline: view()`; already have the `@supports` / reduced-motion pattern in `verify-motion-fallbacks.mjs` |
| M3 | None | ≤12 KB gz vanilla; never the price; `Intl.NumberFormat('he-IL')`; final value stays in HTML |
| M4 | Gallery is inert `<img>` | View Transitions + snap lightbox; focus trap, Escape, return focus |
| M5 | CSS grid, first figure full-bleed | scroll-snap + `view(inline)`; **index 0 is rightmost**; room chips as anchors; RTL `--dir` |
| M6 | Exists | Keep |
| M7 | None | CSS sticky compact bar |
| M8 | `.cta:active` only | Every tappable |
| M9 | None | `@view-transition` enhancement; marketing + editor + listing cover name |

**CI today:** logical props, bdi, motion fallbacks, template divergences. **Missing:** listing JS ≤ 12 KB gz, axe-core, impeccable detect as a gate.

`window.addEventListener('scroll')` — grep clean on listing. Keep it banned.

### Marketing — Phase 4

| Piece | Today | Plan |
|---|---|---|
| JS | none on `/` | GSAP + ScrollTrigger + SplitText + Lenis, budget ~120 KB gz |
| Hero | cycling MiniScreens | wordmark M1 + phone-frame recording |
| Proof | 3 steps | pinned four-minute sequence |
| Before/after | none | keyboard-operable divider |
| GSAP | not in any `package.json` | **New dependency.** Size ~70 KB+ plugins; 100% free since April 2025; last publish: confirm at install time. Why the stack cannot: native CSS cannot pin/scrub a multi-scene timeline. Listing remains forbidden. |

### Editor / dashboard / legal — Phases 5–6

- Editor: desktop facsimile column, mobile peek sheet, M2 on processed photos, streamed description (worker/edge — **not** this client island).
- Dashboard: denser cards, M9 on cover.
- New routes: `/pricing`, `/accessibility`. Placeholders for owner legal text.
- axe-core in CI on listing, homepage, editor.

### Photography — Phase 8, but it gates the homepage

Without Israeli listing photos, Phase 4’s “wow” is MiniScreens of a Rio living room. Concierge-pilot photos first; stock that looks like Holon second; generated **marketing-only**, labelled demo, never beside real facts.

---

## Accessibility gaps (IS 5568 / WCAG 2.0 AA) — inventory, not a fix

- Contrast failures: `.fact.off`, `.odbl`, `--olive-lift` as body on dark, `--muted` on `--stone-warm`.
- No `/accessibility` statement (required by the plan; expected for an Israeli public site).
- Listing gallery/lightbox: no keyboard path because there is no lightbox.
- Touch: listing CTA is full-width ≥ 44px; editor photo controls are 30px.
- `lang="he"` `dir="rtl"` present. One `h1` on listing (hero). Homepage one `h1`.
- Reduced-motion: listing and homepage wrap timelines; editor is incomplete.
- No axe-core in CI.
- Focus: listing CTA has `:focus-visible`; not audited as a full tab loop.

Privacy: no third-party pixels found in these surfaces. Analytics claim is server-side — not verified in this audit. Amendment 13: do not add client trackers in the redesign.

---

## Brand / copy notes (not visual, will show in Phase 4)

- Production wordmark is already **היעד** (S5) and the free-listing mark is **נבנה בהיעד** (S6). This branch’s homepage source still says סיבוב — do not copy that forward.
- Slogan in locales already matches the plan: `המודעה שלך, מוכנה לשליחה` (visible in S5).
- The viral loop mark is copy, not entitlement. Renaming it does not grant publishes.

---

## What I could not verify

- Editor and dashboard screenshots (both need a session). Homepage S5 and listing S6 are live, 390 px.
- Python `urllib` fetch of the Worker returned HTTP 403; Chrome headless eventually wrote S5/S6. Do not treat a 403 as “the site is down.”
- Impeccable **skills** (`/impeccable init`, `typeset`, `colorize`) — zip install failed. Detector CLI ran.
- Hallmark as a Cursor-native slash command — skill files are in `~/.agents/skills/hallmark`, not in this repo.
- Lighthouse / axe / VoiceOver — out of Phase 0. No numbers claimed.
- Contrast of type over a real hero photograph (veil is gradient; ratio depends on the image).
- The later OSM-tile map on `cursor/map-sold-copy-6052` — not in this checkout.
- WhatsApp preview card on two phones.

---

## Phase 0 acceptance

- [x] Binding docs read (`CLAUDE.md`, `RESEARCH.md`, `PRD.md`, `docs/DESIGN-CONTRACT.md`, `docs/DESIGN.md`).
- [x] Impeccable detect run; findings listed.
- [x] Hallmark audit on homepage, listing, editor, dashboard; scores stamped; axes under 3 named.
- [x] Contrast table for `listing.css`.
- [x] Motion / JS / dependency change map.
- [x] CLAUDE.md conflicts listed as STOP.
- [x] `.cursor/rules/project.mdc` added.
- [ ] Operator agrees with this audit — **this is the gate.** Do not start Phase 1 until the STOP table is answered, especially C1 (listing JS), C3 (parenthetical labels), and C5 (do not ship `--absent: #7A7B72`).
