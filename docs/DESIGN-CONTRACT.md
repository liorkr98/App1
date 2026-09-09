# Design contract

Extracted from the three reference files. **Everything in §1–§7 was read out of
them directly — nothing is inferred, improved or added.** §8 is the exception
and says so.

Sources:

- `listing-page-template.html` — property reference, **redesigned in Stage B2**
- `listing-page-vehicle.html` — vehicle reference, **NOT updated by B2**
- `rtl-test.html` — RTL fixture, unchanged

## The vehicle reference is stale, deliberately

Stage B2 replaced the property reference only. The built vehicle page is
therefore **derived** from the new property design by applying the four
permitted divergences, not ported from `listing-page-vehicle.html`, which still
describes the previous design.

Where this document records a vehicle value, it records what the BUILD
produces. `scripts/verify-template-divergences.mjs` compares the two built
pages against each other, so it keeps checking the thing that matters even
though one of its sources is out of date.

---

## 1. Design tokens

Every CSS custom property in the new reference, with its literal value.

### Colour

| Token | Value | Note |
|---|---|---|
| `--plaster` | `#FBFAF7` | טיח, לא קרם |
| `--ink` | `#191A15` | |
| `--ink-deep` | `#111208` | **new in B2** — agent bar and the enrichment inversion |
| `--olive` | `#4A5D3A` | לא כחול — כל מותגי הנדל"ן בישראל כחולים |
| `--olive-lift` | `#5F7749` | **new in B2** — the same hue carried up, for type on `--ink-deep` |
| `--stone` | `#E4E0D6` | |
| `--stone-warm` | `#F1EDE3` | **new in B2** — `.fact.off`, `.flaws`, `.seller` |
| `--muted` | `#6E6F66` | |

`--shadow` from the previous contract is gone. The only shadow in the new
design is on `.cta`, written inline: `0 6px 22px -10px rgba(25,26,21,.55)`.

### The fluid type scale — the change that matters most

| Token | Value |
|---|---|
| `--t-hero` | `clamp(2.6rem, 11.5vw, 4.2rem)` |
| `--t-price` | `clamp(2.1rem, 8.5vw, 3rem)` |
| `--t-num` | `clamp(1.5rem, 5.5vw, 1.9rem)` |
| `--t-h2` | `clamp(1.35rem, 5vw, 1.6rem)` |
| `--t-body` | `1.02rem` |
| `--t-label` | `.74rem` |

Roughly **6× from label to hero**. The previous port compressed this to about
2×, and that compression is what made it read as templated. **Do not collapse
these back to fixed rem values.**

### Spacing

| Token | Value |
|---|---|
| `--gut` | `1.4rem` |

One gutter, used by every full-bleed block. Page width is `620px`.

### Literal colours used outside the token set

| Value | Where |
|---|---|
| `#9C9D93` | muted type on `--ink-deep` — agent bar, `.enrich-sub`, `.count`, `.erow em` |
| `#83847B` | `.source` |
| `#96978E` | `.odbl` |
| `rgba(17,18,8,.9)` / `rgba(17,18,8,.55)` | `.hero-veil` gradient stops |
| `rgba(251,250,247,.16)` / `rgba(251,250,247,.07)` | hairlines inside `.enrich` |

---

## 2. Typography

One stylesheet link, and the weights widened in B2:

```
Frank+Ruhl+Libre:wght@400;500;700;900
Assistant:wght@400;600;700
display=swap
```

**Seven weights now, not four.** 900 exists for one selector — `.hero-title` —
and that is the point of it.

### Hebrew cannot use the standard label trick

Small tracked uppercase labels are the usual way to build hierarchy in a Latin
design. **Hebrew has no case, and positive letter-spacing on Hebrew is wrong.**
So hierarchy here comes from size, weight and colour only, which is what
`.label` encodes: `.74rem`, weight 600, `--muted`.

**Never add `text-transform` or positive `letter-spacing` to Hebrew text.**
Neither appears anywhere in any of the three files.

### Frank Ruhl Libre — where it is applied

| Selector | Weight | Size | Tracking |
|---|---|---|---|
| `.hero-title` | 900 | `--t-hero` | `-.015em` |
| `.price` | 700 | `--t-price` | `-.02em` |
| `.fact-val` | 500 | `--t-num` | `-.01em` |
| `h2` | 500 | `--t-h2` | — |
| `.egroup-head h3` | 500 | `1.1rem` | — |
| `.erow .mins` | 500 | `1.45rem` | — |
| `.seller-name` | 500 | `1.25rem` | — |

**Numbers are the visual anchor.** Prices, fact values and walk times are all
set in the serif at large sizes. This is the single strongest signal of
editorial craft on the page, and it is the reason the serif is in the stack at
all. Body text stays Assistant.

### Assistant — where it is applied

| Selector | Weight |
|---|---|
| `body` | 400 |
| `.label`, `.agent-bar strong`, `.erow .who b` | 600 |
| `.cta` | 700 |
| `.erow .mins small` | 400, `.62rem` |

Font stack: `'Assistant',system-ui,sans-serif` on `body`; `'Frank Ruhl
Libre',serif` on the serif selectors.

---

## 3. Layout order

Top-level landmark sequence, read from `<body>`.

| # | Property | Vehicle |
|---|---|---|
| 1 | `div.progress` | `div.progress` |
| 2 | `div.agent-bar` | `div.agent-bar` |
| 3 | `header.hero` | `header.hero` |
| 4 | `div.price-bar` | `div.price-bar` |
| 5 | `div.facts` | `div.facts` |
| 6 | `section` — על הדירה | `section` — על הרכב |
| 7 | `div.gallery` | **`section.flaws` — מה שכדאי לדעת** |
| 8 | `section.enrich` | `div.gallery` |
| 9 | `section.map` — מיקום | `section.enrich` |
| 10 | `section.seller` | `section.seller` |
| 11 | `div.cta-dock` | `div.cta-dock` |
| 12 | `footer` | `footer` |

The vehicle inserts `.flaws` **between the description and the gallery** and
has **no map section**.

`figure.immersive` is gone from the new reference entirely. It is no longer a
"deliberately not ported" exception — the design does not contain it.

---

## 4. Shared components

Everything below renders identically on both categories. Only the four
divergences in §5 differ, and `scripts/verify-template-divergences.mjs`
compares the two built pages' complete CSS — inline blocks **and** every local
stylesheet they link — to prove it.

| | |
|---|---|
| Page max width | `620px`, `margin-inline:auto` |
| Body bottom padding | `7rem` (clears the fixed CTA dock) |
| Section padding | `2.4rem var(--gut)` |
| Facts grid | `repeat(3,1fr)`, `gap:1px` over a `--stone` ground — the hairlines ARE the gap |
| Absent fact | `.fact.off` → `--stone-warm` ground, `opacity:.42` on value and label |
| Gallery | first figure `grid-column:1 / -1` at `16/10`, the rest paired at `4/3`, `gap:.5rem`, radius `2px` |
| Enrichment | `--ink-deep` ground, `padding-block:2.8rem` |
| Walk-time column | `flex:0 0 3.6rem`, serif `1.45rem`, `--olive-lift` |
| CTA | `--olive`, radius `6px`, padding `1.02rem`, weight 700 |
| Safe area | `calc(.8rem + env(safe-area-inset-bottom))` on `.cta-dock` |
| Hero veil | `padding:7rem var(--gut) 1.6rem` — fixed for both categories now |

---

## 5. Divergences

### The allowed list — exactly four. A fifth is a porting bug.

**5.1 Hero height.** `--heroH` on `<html>`: `84svh` for a property, `64svh` for
a vehicle, both over `min-height:440px`.

This replaced the old `--heroRatio` / `--heroVeilPad` pair. B2 made the hero
full-bleed at a viewport height instead of a cropped aspect-ratio, so the veil
padding no longer moves with it — the gradient runway is `7rem` for both. The
rationale is unchanged: a car is a wide object, and a tall frame either crops
it or fills the rest with asphalt.

One custom property on `<html>` rather than a category class, so the stylesheet
stays byte-identical and a fifth divergence cannot enter as a style override.

**5.2 Price note.** `.price-note` content. Driven by DATA, never by
`listing.category`: a book price selects the comparison form, a per-unit price
appears when the schema marks a `priceDenominator` fact, and free text fills in
otherwise. The CSS is identical.

**5.3 `section.flaws`.** Vehicle only in practice, though the component takes a
list rather than a category. Its own tinted block, deliberately not folded into
the description: the value is that a buyer can find the bad news without
reading prose. An olive dot marks each item, never a warning glyph — these are
disclosures a seller chose to make, and a hazard sign would punish the honesty
the block exists to reward.

**5.4 `section.map`.** Property only. A vehicle's location is an approximate
meeting area, not an address, and pinning a private car for sale to a home
address on a public page is a theft risk.

### Two differences that are NOT divergences

`section.enrich` renders on **both**, with different content — property gets
proximity, vehicle gets the verified specification and ownership history. A
section present on one page and absent from the other would be a fifth
divergence and the build refuses it.

The `.erow .mins` column has no walk time on a vehicle, so it carries the years
an owner held the car, or the year an open period began. Never a duration
measured against today: on a statically built page that means measured against
the build, and it would be silently wrong a year later.

---

## 6. RTL and motion

### 6.1 Logical properties only

**No physical `left`/`right`/`margin-left`/`padding-right`/`border-left`/
`border-right` declaration appears in any of the three files.**
`scripts/verify-web-logical-props.mjs` fails the build on one, and
`scripts/verify-web-lint-fires.sh` plants a violation every run to prove the
scan still matches.

In use: `inset-inline`, `inset-block-start`, `margin-inline`,
`margin-inline-start`, `margin-block-end`, `padding-block-end`,
`border-block`, `border-block-start`, `border-block-end`, `text-align:start`,
`text-align:end`.

`transform-origin:right center` on `.progress` is the one physical word in the
design. It is not a side declaration — it names the anchor the bar grows from,
which is the inline start of an RTL document.

### 6.2 Every number in `<bdi>`

The new design has **more** numbers, not fewer. `scripts/verify-bdi.mjs` scans
the built HTML and fails on a digit outside one; `scripts/verify-bdi-fires.sh`
proves it still matches. `/a/_rtltest` is the single exemption and §7 says why.

### 6.3 Motion — native scroll-driven only

| Effect | Mechanism |
|---|---|
| Hero parallax | `animation-timeline: view()`, range `entry 0% exit 100%`, `translateY(-7%)` → `7%` |
| Section reveals | `animation-timeline: view()`, range `entry 4% entry 46%`, opacity + `translateY(22px)` |
| Progress line | `animation-timeline: scroll(root block)`, `scaleX(0)` → `scaleX(1)` |
| Hero veil | a plain `.55s` `cubic-bezier(.2,.7,.3,1)` entrance, no timeline |

**No animation library, and this is a constraint rather than a preference.**
GSAP is free now, and it is still ~70KB running on the main thread against a
page with a hard performance budget and an INP target. Native scroll-driven
animations run on the compositor. If a visual effect here seems to need
JavaScript, stop and ask.

Everything is wrapped in **both** `@media (prefers-reduced-motion:
no-preference)` and `@supports (animation-timeline: view())`. Support is
roughly 84% globally; the rest see static, correctly laid-out content. That is
the whole progressive-enhancement story and it needs no fallback.

`scripts/verify-motion-fallbacks.mjs` proves the story holds, because both
ways it breaks are silent:

- `.reveal` must have **no** rules outside `@supports`. One `opacity:0` that
  escapes and a Firefox reader loses a third of the page permanently.
- `.hero-img` must **keep** its layout outside `@supports` — position, size
  and object-fit are what make the hero a hero.
- `animation-timeline` must sit inside both wrappers.

`html{scroll-behavior:smooth}` is set unconditionally in the reference. The
port guards it under `prefers-reduced-motion: reduce`: smooth scrolling is
motion too, and a reader who asked for less did not exclude it.

---

## 7. `rtl-test.html` — the acceptance checklist

Ten numbered cases. This is the regression list for every template shipped
from now on.

| # | Case | Stated expectation |
|---|---|---|
| 1 | מחיר בן 7 ספרות — `₪1,850,000` | Shekel sign to the right of the number. Commas in place. No reversal of digit groups. |
| 2 | יחס וטווח — `3 מתוך 5`, `3 / 5`, `2018–2021` | The `3 / 5` form is the sensitive one — without `bdi` it flips to `5 / 3`. |
| 3 | טקסט עברי עם אנגלית מוטמעת — `Herzl St`, `Apple CarPlay` | English words stay in place within the sentence. Comma and full stop at the end, on the left. |
| 4 | גרשיים ויחידות — `95 מ״ר`, `1,600 סמ״ק`, `62,000 ק״מ`, `10 ס״מ` | Hebrew gershayim `״`, not straight quotes `"`. This is the error that will appear on every page if not caught here. |
| 5 | טלפון ותאריכים — `054-1234567`, `03-5551234`, `+972-50-1234567`, `03/2027`, `07/09/2026` | Hyphens do not flip. `+972` prefix stays at the start. |
| 6 | גריד עובדות עם ערך חסר | First cell of each row is the rightmost. `מחסן` greyed (`present:false`), not hidden. A field never answered simply does not appear — deliberately none here. |
| 7 | סדר גרירה — the classic bug | **Index 0 is the rightmost.** If `1` appears on the left, published photo order will be reversed from what the seller chose. |
| 8 | אייקוני כיוון | Arrows flip. Checkmark, star, logo and playback controls do not. |
| 9 | טקסט ארוך וגלישה | Hebrew em-dash `—` does not break mid-line. Comfortable line height. No orphans at paragraph end. |
| 10 | כותרת ארוכה בשתי שורות | Right-aligned, natural break, no clipping. |

Case 6 is the one that encodes the `present` / `null` distinction from
Stage A, and case 7 is the one that will catch an RTL drag-ordering bug in
Stage G.

---

## 8. Surfaces that are not the listing page

**Sections 1–7 above are extraction.** Every value in them was read out of the
three reference files, and the guarantee at the top of this document — nothing
inferred, improved or added — applies to those sections only.

**This section is design, not extraction.** It records decisions taken for two
surfaces the references never covered: the homepage at `/` and the editor at
`/new`. They are written down here so the next change to them argues with a
recorded decision rather than with taste.

### The 600px column belongs to the listing page

`max-width:600px` is right for a document meant to be read on a phone and
forwarded. It is not a house style. The first homepage inherited it and, on a
desktop browser, stranded a narrow column in the middle of a wide window with
a fixed bottom bar laid over the content behind it.

The homepage uses a `1120px` shell with a fluid gutter, two columns above
`900px`, and no fixed dock at any width. The editor keeps a single column,
because a form is read the same way a document is.

### The homepage preview is the real page

`/` embeds `/a/A7K2M` and `/a/V3M9Q` in an iframe at **320px**, which is a
real phone width — nothing is scaled and nothing is redrawn. A screenshot or a
mockup would start drifting from the product the day after it was made. Two
radio inputs switch between them with no JavaScript.

### The provenance badges are not on the homepage

A `מאומת` row and a `לפי המוכר` row were rendered under the provenance
paragraph as a demonstration. Out of the context of a real listing they read
as stray fragments of another screen. **The distinction itself is unchanged
and remains what §7 of CLAUDE.md says it is** — the trust proposition, legal
rather than stylistic. It is now shown by the running page in the preview,
which is where it means something.

### Type roles

Five, distinguishable at a glance, and no two weights doing different jobs at
the same size:

| Role | Value |
|---|---|
| display | `clamp(2.5rem, 6vw, 3.6rem)`, Frank Ruhl Libre 700, `-0.03em` |
| lead | `clamp(1.15rem, 2.2vw, 1.4rem)`, Assistant 400, muted |
| heading | `clamp(1.2rem, 1.6vw, 1.4rem)`, Frank Ruhl Libre 500 |
| body | `1.0625rem`, Assistant 400, measure `68ch` |
| meta | `0.8rem`, Assistant 400/600, muted |

Prose measure stays inside 65–75ch. Tracking never goes below `-0.04em`. Data
that changes under the reader — counts, prices, measurements — is set with
`font-variant-numeric: tabular-nums` so the line does not shift.

Space above a heading exceeds space below it. A heading belongs to what
follows; even spacing leaves it floating between two blocks.

### Motion

One authored entrance per view, `600ms`, `cubic-bezier(.16,1,.3,1)`. A second
element may follow at `120ms`; nothing staggers beyond that and nothing below
the fold animates on scroll.

**Never animate a layout-driving property** — width, height, inline-size, top,
left, margins. The editor's progress bar did animate `inline-size`, relaying
out on every frame; it is a composited `scaleX` now, with the origin at `100%`
because that is the inline start of an RTL document.

Under `prefers-reduced-motion: reduce` the movement is removed and the opacity
kept: the arrival still reads, it simply does not travel.

### Banned, on these surfaces as on the listing page

Cards, and anything nested in a card. Gradient text. Decorative blur or glass.
Emoji or Unicode characters standing in for icons. Eyebrows above headings.
Invented statistics, and logos of companies that do not use this.
