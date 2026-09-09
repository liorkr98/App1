# Design contract

Extracted from the three reference files. **Everything here was read out of
them directly — nothing is inferred, improved or added.**

Sources:

- `listing-page-template.html` — property reference (11,073 bytes)
- `listing-page-vehicle.html` — vehicle reference (10,051 bytes)
- `rtl-test.html` — RTL fixture (6,874 bytes)

The CSS comparison below was produced by a brace-depth parser that isolates
`@media` and `@keyframes` blocks, normalises whitespace and sorts declarations,
so formatting differences do not read as design differences.


## The immersive figure is deliberately not ported

The reference HTML files still contain `figure.immersive` and its CSS, and the
tables below still record them — they are a faithful record of the references,
and falsifying that record to match the build would defeat the point of having
one.

The Astro port omits that figure. RESEARCH.md v2 §9 defers immersive capture,
so there is nothing to put in it. This is **not a fifth divergence**: the
figure is absent from BOTH category templates, so the two remain identical
where the contract requires it. The port is at the `immersive-v1` tag if the
block is ever needed again.

---

## 1. Design tokens

Every CSS custom property, with its literal value.

### Listing pages — identical `:root` in both files

| Token | Value | Comment in source |
|---|---|---|
| `--plaster` | `#FBFAF7` | טיח, לא קרם |
| `--ink` | `#191A15` | |
| `--olive` | `#4A5D3A` | לא כחול — כל מותגי הנדל"ן בישראל כחולים |
| `--stone` | `#E4E0D6` | |
| `--muted` | `#6E6F66` | |
| `--shadow` | `0 1px 2px rgba(25,26,21,.06)` | |

### `rtl-test.html`

Same five colour tokens, **no `--shadow`**, plus one extra:

| Token | Value |
|---|---|
| `--plaster` | `#FBFAF7` |
| `--ink` | `#191A15` |
| `--olive` | `#4A5D3A` |
| `--stone` | `#E4E0D6` |
| `--muted` | `#6E6F66` |
| `--fail` | `#8C2F1E` |

### Literal colours used outside the token set

| Value | Where |
|---|---|
| `#F5F2EA` | `.flaws` background, vehicle only |
| `rgba(25,26,21,.82)` | `.hero-veil` gradient, both |
| `rgba(25,26,21,.34)` | `.immersive-scrim` background, both |
| `rgba(25,26,21,.2)` | `.immersive-enter` box-shadow, both |

---

## 2. Typography

Loaded in all three files by one stylesheet link:

```
Frank+Ruhl+Libre:wght@500;700
Assistant:wght@400;600
display=swap
```

Only these four weights are requested. No other weight appears.

### Frank Ruhl Libre — where it is applied

| Selector | Weight | Size |
|---|---|---|
| `.hero-title` | 700 | `2rem`, line-height `1.25` |
| `.price` | 700 | `1.9rem`, letter-spacing `-.01em` |
| `.fact-val` | 500 | `1.3rem`, line-height `1.2` |
| `h2` | 500 | `1.15rem` |
| `.big` *(rtl-test)* | 700 | `1.9rem` |
| `.fact-val` *(rtl-test)* | — | `1.2rem` |
| `h1` *(rtl-test)* | — | `1.6rem` |
| `.strip div` *(rtl-test)* | — | `1.1rem` |

### Assistant — where it is applied

| Selector | Weight | Size |
|---|---|---|
| `body` | 400 (inherited) | line-height `1.6` |
| `.immersive-enter` | 600 | `1rem` |
| `.cta` | 600 | `1.05rem` |
| `.seller-name` | 600 | — |
| `.case h2` *(rtl-test)* | 600 | `.8rem` |

Font stack: `'Assistant',system-ui,sans-serif` on `body`; `'Frank Ruhl
Libre',serif` on the serif selectors.

**No `font-style:italic` and no `text-transform` appears in any of the three
files.**

---

## 3. Layout order

Top-level landmark sequence, read from each `<body>`.

| # | Property | Vehicle |
|---|---|---|
| 1 | `header.hero` | `header.hero` |
| 2 | `div.price-bar` | `div.price-bar` |
| 3 | `div.facts` | `div.facts` |
| 4 | `figure.immersive` | `figure.immersive` |
| 5 | `section` — על הדירה | `section` — על הרכב |
| 6 | `div.gallery` | **`section.flaws` — מה שכדאי לדעת** |
| 7 | `section.map` — מיקום | `div.gallery` |
| 8 | `section` — seller | `section` — seller |
| 9 | `div.cta-dock` | `div.cta-dock` |
| 10 | `footer` | `footer` |

Both are 10 landmarks. The vehicle page inserts `.flaws` **between the
description and the gallery**, and has **no map section**.

---

## 4. Shared components

**42 of 46 property rules are byte-identical to their vehicle counterparts**
after normalisation. Those 42 are the shared base layout and may be extracted
wholesale.

Identical rule groups:

- `*`, `html`, `body`
- `.hero img`, `.hero-place`, `.hero-title`
- `.price-bar`, `.price`, `.price-note`
- `.facts`, `.fact`, `.fact:nth-child(3n+1)`, `.fact:nth-child(-n+3)`, `.fact-val`, `.fact-lbl`, `.fact.off .fact-val,.fact.off .fact-lbl`
- `.immersive`, `.immersive img`, `.immersive-scrim`, `.immersive-enter`, `.immersive-enter:focus-visible`, `.immersive-note`
- `section`, `h2`, `p`
- `.gallery`, `.gallery::-webkit-scrollbar`, `.gallery figure`, `.gallery img`, `.gallery figcaption`
- `.seller`, `.avatar`, `.seller-name`, `.seller-role`
- `.cta-dock`, `.cta`, `.cta:focus-visible`
- `footer`, `footer a`
- `@media (prefers-reduced-motion:no-preference) >> .hero-veil`, and the `rise` keyframe

Shared structural constants:

| | |
|---|---|
| Page max width | `600px`, `margin-inline:auto` |
| Body bottom padding | `6rem` (clears the fixed CTA dock) |
| Facts grid | `repeat(3,1fr)`; hairlines only **between** cells, via `:nth-child(3n+1)` and `:nth-child(-n+3)` resets |
| Absent fact | `.fact.off` → `opacity:.35` on both value and label |
| Immersive poster | `aspect-ratio:16/10` |
| Gallery item | `flex:0 0 78%`, `scroll-snap-align:center`, image `aspect-ratio:4/3`, `border-radius:3px` |
| CTA | `background:var(--olive)`, `border-radius:4px`, `padding:.95rem` |
| Motion | exactly one animation, `rise`, `.5s .1s cubic-bezier(.2,.7,.3,1)`, gated behind `prefers-reduced-motion:no-preference` |
| Safe area | `calc(.75rem + env(safe-area-inset-bottom))` on `.cta-dock` |

---

## 5. Divergences

### The allowed list — exactly four. A fifth is a porting bug.

Resolved by the product owner after B0. Nothing else may differ between the
two category templates.

**1 · The hero block** — aspect ratio and veil padding together

| | Property | Vehicle |
|---|---|---|
| `.hero` aspect-ratio | `4/5` | `4/3` |
| `.hero-veil` padding | `5rem 1.5rem 1.25rem` | `4.5rem 1.5rem 1.25rem` |

These are **one decision, not two**: the padding differs *because* the aspect
ratio does. A car is a wide object, so a vertical frame either crops it or
leaves dead asphalt (the reasoning is inline in the vehicle file), and the
shorter 4/3 hero needs less gradient runway above the title.

Treat the hero as a single category-parameterised component taking both values
from one place. Splitting them into two independent overrides invites someone
to change one and not the other.

**2 · `.price-note` content**

| Property | Vehicle |
|---|---|
| `פינוי גמיש` | `מחיר מחירון: <bdi>₪94,000</bdi>` |

**CSS is identical** — the same `.price-note` rule serves both. This is a
content divergence only. It must not become a style divergence.

**3 · `section.flaws` — vehicle only**

`מה שכדאי לדעת`, sitting between the description and the gallery.

```
.flaws            { background:#F5F2EA }
.flaws ul         { list-style:none; margin-top:.5rem }
.flaws li         { border-block-end:1px solid var(--stone); font-size:.95rem; padding:.45rem 0 }
.flaws li:last-child { border:none }
```

**4 · `section.map` — property only**

```
.map img { width:100%; border-radius:3px; display:block; background:var(--stone) }
.addr    { font-size:.9rem; color:var(--muted); margin-top:.6rem }
```

Not an oversight, and the reason matters for anyone tempted to "fix" it
later: a vehicle's location is an approximate meeting area, not an address.
Pinning a private car for sale to a home address on a public page is a
**theft risk**. The city in `.hero-place` is the correct resolution for
vehicles, and no map section is rendered for them.

### Two differences that are NOT divergences

Both are per-listing generated metadata, not template CSS. One code path
produces them for both categories, so neither creates a fifth divergence.
The property reference file is simply older than the spec.

| | Property file | Vehicle file | Resolution |
|---|---|---|---|
| `og:image` | `a7k2m.jpg`, no hash | `v3m9q-8f21c4.webp` | **WebP, content hash in the filename**, both categories |
| `robots` | *(absent)* | `noindex` | **`noindex` by default**, driven by `listing.indexable`, both categories |

---

## 6. RTL techniques in use

**No physical `left`/`right`/`margin-left`/`padding-right`/`border-left`/
`border-right` declaration appears in any of the three files.** Verified by
regex across all three `<style>` blocks.

### Logical properties, by file

| Property | Vehicle | rtl-test |
|---|---|---|
| `border-block-start` | `border-block-start` | `border-block-start` |
| `border-inline-start` | `border-inline-start` | `border-inline-start` |
| — | `border-block-end` | `border-block-end` |
| `inset` | `inset` | — |
| `inset-inline` | `inset-inline` | — |
| `margin-inline` | `margin-inline` | `margin-inline` |
| `scroll-snap-align` | `scroll-snap-align` | — |
| — | — | `padding-block` |

Where each is used:

- `border-inline-start` — `.fact` vertical hairline, reset by `:nth-child(3n+1)`
- `border-block-start` — `.fact` horizontal hairline, reset by `:nth-child(-n+3)`
- `border-block-end` — `.flaws li` separator (vehicle), `.case` separator (rtl-test)
- `inset-inline:0` — `.hero-veil`, `.cta-dock`
- `inset:0` — `.immersive-scrim`
- `margin-inline:auto` — `body`, `.cta-dock`
- `padding-block` — `.case` (rtl-test)

### `<bdi>` usage sites

`listing-page-template.html` — **10 sites**

`4` · `₪1,850,000` · `95` · `3` · `5` · `4` · `12` · `6` · `8` · `42`

Covering: room count in the title, price, m², floor and total floors as two
separate `<bdi>` elements around a literal `/`, room count fact, balcony m²,
and the two immersive-note numbers, plus the street number in `.addr`.

`listing-page-vehicle.html` — **11 sites**

`3` · `2021` · `₪89,000` · `₪94,000` · `2021` · `62,000` · `1,600` ·
`03/2027` · `36` · `8,000` · `10`

Covering: model number and year in the title, both prices, year, km, engine
cc, test date, frame count, km in prose, and a defect measurement in `.flaws`.

`rtl-test.html` — **27 sites** (see §7)

### Directional icon handling

`rtl-test.html` defines `.chev{display:inline-block;transform:scaleX(-1)}`,
applied to `›` and `‹`. Its case 8 states that arrows flip while checkmark,
star, logo and playback controls do not.

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
