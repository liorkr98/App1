# Product

Written for the Impeccable skill, 10 September 2026. It is the strategic
layer; `DESIGN.md` beside it is the visual layer. Where this file and
`RESEARCH.md` disagree, RESEARCH.md wins — see CLAUDE.md §1.

## Register

brand

The surface this file was written for is the **homepage** (`web/src/pages/index.astro`),
which is a marketing surface: design IS the product there. The rest of the
repo is split — `/a/{slug}` listing pages are brand-adjacent (the artefact
being sold is a designed page), and `/new` is product register (a multi-step
form; design serves the task). When working on `/new`, read
`reference/product.md` instead.

## Users

**Primary: Israeli licensed estate agents.** The Justice Ministry register
lists 22,995 of them with contact details. An agent sends several listings a
week, mostly to WhatsApp broadcast lists and Status, often *before* the
property reaches Yad2 or Madlan. They are judged by whether clients reply.
They care about speed of creation, their own branding on the artefact, and
looking professional across a whole portfolio rather than on one page.

Their context when they meet this homepage: on a phone, between viewings,
possibly in sunlight, with about forty seconds of patience.

**Secondary: private sellers.** They sell an apartment about once every seven
years and a car once every four. They arrive from a footer credit on a listing
someone forwarded them. They convert, but they are not the design target.
CLAUDE.md §1: when the two conflict, **agents win.**

**The buyer is not a user of this page.** They are the user of `/a/{slug}`.
Keeping that straight is the main discipline the homepage needs — most of its
past drafts drifted into arguing to buyers.

## Product Purpose

A seller uploads photos of an apartment or a car, picks one of three
templates, and gets back a short, professional Hebrew page, shareable by one
link.

**The product is speed to a page an agent is proud to send, and a choice of how
it looks.** Photos in, a few fields, one of seven templates, a link — four
minutes.

**Superseded 11 September 2026:** this file previously said "the moat is the
data, not the page". Agents do not want validated data; they want a fast,
professional, shareable page. The enrichment layer is still built and still
running, demoted rather than deleted. See CLAUDE.md §1.

The homepage's single job: **convince an agent to build their first listing.**
Success is a click through to `/new`, not a signup — there is no account until
publish.

## Brand Personality

**Checkable · plain · unhurried.**

The voice is declarative and short. It states what the product does and what
it refuses to do, and it never sells. The existing Hebrew copy is the
reference and it is already right:

- המודעה שלך, מוכנה לשליחה
- שבע תבניות. אותו נכס.
- התבנית קובעת איך העמוד נראה, לא מה כתוב בו.
- בלי הרשמה עד הפרסום.

The provenance lines this list used to quote — מה שמאומת — כתוב מאין, מה שלא
יודעים — לא כותבים — were removed from the homepage with the pivot. The shape
is the thing to keep: a claim, an em-dash, the limit.

Note the shape: a claim, an em-dash, the limit. **Do not write copy that
promises.** The emotional goal is relief that someone finally did not
exaggerate.

Hebrew is the design baseline, never a translation of an English layout.

## Anti-references

- **Yad2 and Madlan.** Dense, blue, portal-shaped, every listing identical
  and none of them trustworthy. CLAUDE.md §10 rules out touching them; the
  design should also not resemble them. **Never blue** — every Israeli real
  estate brand is blue.
- **The SaaS landing template.** Hero metric row, three identical icon-and-
  heading cards, gradient accents, logo wall, "trusted by". This product has
  no logos to wall and no metrics to boast.
- **Prettiness with nothing behind it.** No longer "Canva" — since the pivot
  the page IS most of the product, so the anti-reference is narrower: a
  template that looks good in a screenshot and falls apart on a real listing
  with a long Hebrew title, eleven photos and no address.
- **Apologetic demos.** A preview that shows a fragment and then explains in
  small grey text why it is a fragment. If a demonstration needs an excuse,
  build a different demonstration.

## Design Principles

1. **Demonstrate, never claim.** Every argument on this page should be made by
   showing the real artefact. Since the pivot that means the templates: one
   listing rendered three ways says "a few options, all professional" faster
   than a sentence about it can be read.
2. **The homepage must not be quieter than the thing it advertises.** The
   listing page commits: a 6× type scale, a 900-weight Hebrew serif, a
   full-bleed photograph, an inverted enrichment section. A landing page in
   a smaller, softer key reads as the weaker product.
3. **Consistency across listings is the agent's pitch.** One device mockup
   cannot say "all of your listings will look like this." Several shown side
   by side can — which is also how the template choice is presented.
4. **Nothing on this page may drift from the product.** Sample content is
   imported from `web/src/lib/listings.ts`, the same module the real pages
   render. If the data changes, the homepage changes with it.
5. **Speed is conversion.** Cellular, one-handed, in sunlight. No page-weight
   spent on decoration.

## Accessibility & Inclusion

- WCAG 2.2 AA. Body text ≥4.5:1, large text ≥3:1, verified against the token
  set rather than by eye.
- **`--olive-lift` on `--ink-deep` measures 3.83:1.** It is a large-text-only
  colour. Never use it for body copy on the dark ground; use `--plaster` or
  `#9C9D93` (6.94:1) there.
- `prefers-reduced-motion` strips movement and keeps opacity. Never removes
  the arrival entirely — the content must not depend on a transition firing.
- RTL is the baseline, not a mode. Logical properties everywhere;
  `scripts/verify-web-logical-props.mjs` enforces it in CI.
- **Never apply `text-transform` or positive `letter-spacing` to Hebrew.**
  Hebrew has no case and tracking damages it. Negative tracking is capped at
  −0.015em on display sizes and is zero everywhere else.
- Every number inside a Hebrew sentence is wrapped in `<bdi>`.
