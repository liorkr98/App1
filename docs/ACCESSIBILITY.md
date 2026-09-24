# Accessibility — ת״י 5568 AA in the code

Israeli internet services sit at **ת״י 5568 Level AA** (Equal Rights for People with Disabilities Law, regulation 35א). The standard is WCAG 2.0 AA plus national additions. Regulation 35ה requires a prominent **הצהרת נגישות**.

This product implements that bar **in HTML and CSS**. There is no AccessiBe, UserWay, EqualWeb, or floating overlay. Overlays do not fix headings, labels, or keyboard order, and they fight Hebrew screen readers.

We are not a lawyer. Do not claim “האתר מונגש” or “certified 5568” on the homepage until an auditor says so. The technical bar is what this file and `/legal/accessibility/` describe.

## What a PR must keep

| Surface | Rule |
|---|---|
| All | First focusable control is `a.skip` → `#main`, visible on focus |
| Listing | `<main id="main">`, `<header>` (agent bar), `<footer>`, one `h1` |
| Focus | `:focus-visible` ring 3px; never `outline: none` without a replacement |
| Contrast | `--olive-lift` on `--ink-deep` is **3.83:1** — large text only. Body on dark uses plaster / `#9C9D93` |
| Numbers | Every number in `<bdi>` |
| RTL | Logical CSS only; DOM order is reading order |
| Images | Cover/gallery keep seller `alt`; logos next to a name get `alt=""` |
| Walk | Thumbs are decorative (`alt=""`); the link `aria-label` is the name; current thumb exposes visually hidden “נוכחי” |
| Motion | Scroll-driven animation only inside `@supports` and `prefers-reduced-motion: no-preference` |

## How we fail a PR

`scripts/verify-a11y.mjs` runs on built `/`, `/new`, `/template-check/A7K2M`, `/template-check/walk`. Missing skip, missing `#main`, missing `lang="he"` / `dir="rtl"`, or a page without exactly one `h1` fails CI.

`scripts/verify-web-logical-props.mjs` and `scripts/verify-bdi.mjs` remain the RTL and number gates.

No new npm dependency. axe-core is not in the bundle.

## Statement page

`/legal/accessibility/` — Hebrew, linked from homepage, legal footer, listing footer. Contents: standard used, date last reviewed, known limits (WhatsApp, optional Matterport tab, PDF part 2 later), how to report a barrier. Coordinator name only if the law requires an appointment.
