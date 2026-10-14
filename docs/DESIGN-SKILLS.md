# Design skills

Installed 14 October 2026 at the owner's request ("use taste-skill for
everything, and three more design-checking skills"). Each one was read in full
before it was committed. They live in `.claude/skills/` so that every session
has them, and `skills-lock.json` pins each one to the hash that was reviewed.

| Skill | Source | Licence | Use it for |
|---|---|---|---|
| `design-taste-frontend` (taste-skill v2) | Leonxlnx/taste-skill | MIT | Public pages: home, audiences, pricing, guides, templates gallery. Art direction, house rules, `lint.mjs` and `inspect.mjs`. |
| `frontend-design` | anthropics/skills | Apache-2.0 | One deliberate direction before any new surface; restraint; copy that says what happens. |
| `web-design-guidelines` | vercel-labs/agent-skills | MIT | Auditing any file against Vercel's Web Interface Guidelines: a11y, focus, forms, motion, performance. |
| `ui-ux-pro-max` | nextlevelbuilder/ui-ux-pro-max-skill | MIT | App screens taste-skill does not cover (the editor, `/mine`, `/me`, the share sheet): touch targets, states, forms, dark contrast. |

To update a skill: `npx skills update`. Then read the diff before committing,
because a skill is instructions, and instructions run with the agent's
permissions.

## Precedence

1. The owner's own words.
2. `CLAUDE.md`, `RESEARCH.md` and `PRD.md`.
3. `docs/DESIGN-CONTRACT.md`. The listing templates are ported, not
   redesigned, and the four divergences stay four.
4. The CI gates in `scripts/`.
5. These skills.

A skill's finding that breaks a rule above is recorded and dropped, not built.

## Known conflicts, decided once

| A skill says | Here | Why |
|---|---|---|
| Italic or lowercase-italic accents; positive tracking on small labels; small caps | **Never** | Hebrew has no italic, no case, and no letter-spacing (CLAUDE.md §5) |
| Fonts such as Geist, Satoshi or Outfit; Google Fonts links | **Self-hosted Hebrew faces only** | `verify-no-google-fonts`. A Latin display face has no Hebrew glyphs |
| GSAP presets, Framer Motion | **Not without asking** | No new dependency (CLAUDE.md §2); CSS motion behind `prefers-reduced-motion` |
| taste-skill's motion layer: 8 or more moving elements per page | **Public pages only, within budget** | Home is at 899.9 of 900 KB; listing pages have a 12 KB JS budget and the motion guard |
| Open-collection or picsum photographs to fill sections | **Never on a listing; credited and only where honest on site pages** | A listing shows the seller's photographs, and nothing else may pass as the property |
| `left` / `right`, `text-align: left` | **Logical properties** | `verify-web-logical-props` |
| Testimonials, logos, statistics as proof | **Only real ones** | taste-skill agrees: proof is never invented |
| "No glass, no gradients, no eyebrows" (taste-skill house rules) | **Adopted on site pages, 14 Oct 2026** | The audit removed the glows, the gradient text, the glass cards and the small labels above headings. Listing templates keep theirs (design contract) |

## Dials

UI/UX Pro Max takes them as `--variance --motion --density`:

| Surface | Variance | Motion | Density |
|---|---|---|---|
| Public pages | 5 | 4 | 4 |
| App screens (editor, dashboard, share sheet) | 3 | 3 | 6 |

taste-skill uses its own draw instead (`--sector`, `--tone`, `--keep
palette,type`). Pass `--keep palette,type` while the token system in
`web/src/styles/system/tokens.css` is canon.

## How to run the checks

```bash
# taste-skill: banned patterns in source, then a real-browser inspection.
# Cloud sessions: CHROME_PATH=/opt/pw-browsers/chromium.
node .claude/skills/design-taste-frontend/scripts/lint.mjs web/src/pages/index.astro
CHROME_PATH=/opt/pw-browsers/chromium node .claude/skills/design-taste-frontend/scripts/inspect.mjs http://127.0.0.1:8099/

# UI/UX Pro Max: one concern per query
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "icon button accessible label" --domain ux
```

`web-design-guidelines` fetches its rules from GitHub on each run, and
`frontend-design` is prose. Neither has a script.

## Decided in the 14 Oct 2026 audit

- **One system for every site page.** Marketing pages are Onyx, while
  reading pages (guides, legal, about, contact, the 404) and the editor are
  Paper. Both use the same shell (`layouts/Site.astro`), faces, header and
  footer. `layouts/Plain.astro` is now only a reading column on that shell.
- **Faces:** Noto Sans Hebrew for display and Heebo for body (CLAUDE.md §5).
  The wordmark stays Frank Ruhl Libre.
- **Scale on site pages:** body 17px in full ink. The lead is 1.15rem, notes
  are at least 0.95rem, and tags at least 0.8rem.
- **Focus:** one 2px accent ring for every control, 3px outside it.
- **Flat colour:** no gradients, glows or glass on site pages. Shadows only
  on what floats (a dialog, the share sheet).
- **Only what works today** is sold on a marketing page.

