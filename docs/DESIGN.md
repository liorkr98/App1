# Design

The visual system. `PRODUCT.md` beside it holds the strategy.

**`docs/DESIGN-CONTRACT.md` remains the authority for the listing page.** That
document was extracted literally from the reference files and CI checks the
build against it. This file does not restate it; it records the system as a
whole and the decisions the **homepage** adds on top.

## Theme

**Light-dominant with committed dark acts.** Not a dark theme and not a light
one: the product alternates.

The scene that forces it — an agent on a phone between viewings in Holon at
4pm, sun on the screen. That rules out a low-contrast dark UI and rules out
anything delicate. It also rules out a uniformly pale page, which is what the
first homepage was: in sunlight a plaster-on-plaster hierarchy collapses to
one flat sheet.

So the value rhythm is **dark → light → dark**, which the listing page already
does on its own (dark agent bar, plaster body, inverted enrichment section).
The homepage now follows the same rhythm rather than sitting entirely in
plaster.

## Color

Strategy: **Committed.** `--ink-deep` carries whole sections; `--olive` is
reserved for one meaning.

All values live in `web/src/styles/tokens.css`. Do not hard-code hex in a
component — the homepage previously used `#f5f2ea` where `--stone-warm`
already existed, and that is how two surfaces drift apart.

| Token | Value | Role |
|---|---|---|
| `--plaster` | `#FBFAF7` | the reading ground |
| `--ink` | `#191A15` | body type on plaster |
| `--ink-deep` | `#111208` | inverted sections, agent bar |
| `--olive` | `#4A5D3A` | **provenance and action, nothing else** |
| `--olive-lift` | `#5F7749` | the same hue for display type on `--ink-deep` |
| `--stone` | `#E4E0D6` | hairlines, grid gaps |
| `--stone-warm` | `#F1EDE3` | tinted blocks, absent facts |
| `--muted` | `#6E6F66` | secondary type on plaster |

**Olive means one thing: this was checked, or this is the action.** It marks
the `מאומת` chip and it fills the CTA. It is never decoration, never a section
tint, never a border for emphasis. The discipline is what makes the chip read
as a claim about provenance instead of as styling.

Not blue, deliberately: every Israeli real estate brand is blue.

### Measured contrast

Computed, not judged by eye.

| Pair | Ratio | Verdict |
|---|---|---|
| `--muted` on `--plaster` | 4.87:1 | AA body ✓ |
| `--olive` on `--plaster` | 6.90:1 | AA body ✓ |
| `--plaster` on `--olive` | 6.90:1 | CTA ✓ |
| `#9C9D93` on `--ink-deep` | 6.94:1 | AA body on dark ✓ |
| **`--olive-lift` on `--ink-deep`** | **3.83:1** | **large text only** |

The last row is the trap. `--olive-lift` exists so olive can be seen on the
dark ground, but it does not reach 4.5:1 there. Display type and headings
only; body copy on `--ink-deep` uses `--plaster` or `#9C9D93`.

## Typography

Two families on a real contrast axis — Hebrew serif and Hebrew sans. Both are
native Hebrew designs, not Latin faces with Hebrew bolted on.

- **Frank Ruhl Libre** (400/500/700/900) — a revival of Raphael Frank's 1908
  Frank-Rühl, which is to Hebrew what Times is to English. Headlines, prices,
  fact values, walk times. **Numbers are the visual anchor**, and setting them
  in the serif at large sizes is the strongest craft signal in the product.
- **Assistant** (400/600/700) — body, labels, UI.

Weight 900 exists for one selector, `.hero-title`, and that is the point of it.

### Hebrew rules, non-negotiable

- **No `text-transform`.** Hebrew has no case.
- **No positive `letter-spacing`.** It damages Hebrew.
- Negative tracking capped at **−0.015em**, display sizes only, zero
  elsewhere. The homepage previously ran −0.03em on its `h1`; that is tighter
  than the project's own contract and tighter than the script tolerates.
- **Body `line-height: 1.7`.** Hebrew needs more leading than Latin at the
  same size. 1.5 is a Latin default and reads cramped here.
- Small tracked uppercase labels — the usual Latin way to build a hierarchy —
  are unavailable. Hierarchy comes from **size, weight and colour only.**
- Every number inside a Hebrew sentence is wrapped in `<bdi>`.

### Scale

Fluid `clamp()`, roughly **6× from label to hero**. Do not collapse these to
fixed rem values; the compression from 6× to 2× is what made an earlier port
read as templated.

Listing page: `--t-hero` `clamp(2.6rem, 11.5vw, 4.2rem)` down to `--t-label`
`.74rem`. The homepage carries its own scale in the same spirit, and its
display size is **not smaller than the listing page's** — see PRODUCT.md
principle 2.

## Layout

- Page width for the listing document: **620px**. It is a document meant to be
  read on a phone, and that measure is correct for it.
- **The homepage is not that shape.** A 600px column stranded in a wide window
  is the mistake the first version made. Shell is `1120px` with a fluid
  `--gutter`.
- Logical properties only (`inline-size`, `padding-inline`,
  `inset-inline-start`). Enforced by `scripts/verify-web-logical-props.mjs`.
  In RTL a grid fills from the right on its own; nothing computes that.
- Prose measure capped at 65–75ch.
- More space above a heading than below it — the heading belongs to what
  follows.

## Motion

Tokens in `tokens.css`: `--ease-out: cubic-bezier(.23,1,.32,1)`,
`--press: 160ms`.

- **One authored entrance per page**, 500–800ms, exponential ease-out.
  Stagger is capped at two or three steps.
- **No scroll-triggered reveals.** A uniform fade-and-rise on every section is
  the AI reflex, and worse, a reveal gated on a transition ships blank in a
  headless renderer or a background tab.
- Press feedback 100–160ms — `transform: scale(.97)`, never a layout property.
- `prefers-reduced-motion: reduce` removes movement and keeps opacity. Content
  is visible by default; motion only ever enhances it.

## Components

One concern each, in `web/src/components/`. The homepage composes its device
screens from the **same data module the listing pages render**
(`web/src/lib/listings.ts`), so a change to the sample content changes both.
That is the property the previous iframe preview was reaching for and did not
achieve.

### Bans specific to this project

- No gradient text, no decorative blur, no glassmorphism.
- No emoji as icons.
- **No tick mark for `מאומת`.** A tick reads as "good"; this is a statement
  about who recorded a number, not a recommendation. Olive rule and a word.
- No eyebrow labels above section headings.
- A confirmed absence (`אין`) and an unanswered field are **different
  answers** and must never render alike.
