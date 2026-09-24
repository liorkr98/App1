# Shell contract — surfaces that are not the listing page

The listing page is governed by `docs/DESIGN-CONTRACT.md`. This file is the
same kind of record for the **shell**: homepage, editor, dashboard, pricing,
legal. Tokens live in `web/src/styles/tokens.css`. Do not declare a second
type scale or a second olive.

## Tokens the shell must use

Colour, type, motion and `--dir` are the listing tokens. Marketing display
type is `--t-display`. Body on `--stone-warm` uses `--muted-warm`, not
`--muted`. Confirmed-absent UI uses `--absent`, never opacity.

## Parenthetical section labels

`(הדירה)` · `(מסביב)` · `(גלריה)` · `(המתווך)` — and the same device on
marketing sections. Component: `web/src/components/SectionLabel.astro`.

## Two budgets

| Surface | JS | Motion |
|---|---|---|
| Listing `/a/[slug]` | ≤ 12 KB gz vanilla. Counters + lightbox only. | CSS-first. M1–M8. |
| Marketing | GSAP + ScrollTrigger allowed, not required. This pass uses CSS sticky for the four-minute proof so we do not add a ~70 KB library until pinning earns it. | Richer. Still one easing family. |

## What the shell must not do

- Physical `left`/`right` in CSS.
- `translateX()` without `var(--dir)`.
- Gradient text, glass hero, blue, bounce easing.
- A third-party tracker or pixel (Amendment 13).
- Entitlement decisions (CLAUDE.md §8). Displaying remaining listings is UX;
  the Postgres trigger is the law.
- Invented metrics, stock “happy agent with laptop”, generative imagery of a
  **real** listing.

## Pages

| Route | Mode | Notes |
|---|---|---|
| `/` | Brand | Narrative in the redesign plan §6.2 |
| `/new` | Product | Step flow, facsimile, M8 |
| `/mine` | Product | Dense cards, not a portal |
| `/pricing` | Brand | Three paid shapes + the free mark. Checkout disabled. |
| `/legal/*` | Document | Owner supplies legal prose; placeholders stay marked |
| `/lab` | Internal | Motion primitives M1–M9. Noindex. |
| `/accessibility` | Redirect | 301 to `/legal/accessibility/` |
