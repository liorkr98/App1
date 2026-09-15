# UX behaviour — three users, three jobs

The artefact is still **one Hebrew page an agent is proud to send in WhatsApp in four minutes.** The buyer never uses the homepage. The agent never uses the listing the way a buyer does.

## Buyer — `/a/[slug]`

Context: in-app browser, mid-range Android, often sunlight, 3–8 seconds.

**First screen, without scrolling on a 390×844 phone:** agent identity, photograph, price, rooms / m² / floor. No lifestyle copy above the price.

| Action | What happens |
|---|---|
| Open link | Static HTML. No spinner, no JS hydrate. LCP is the hero (`fetchpriority=high`). |
| Scroll | Native `animation-timeline`; off under `prefers-reduced-motion`. |
| Filmstrip thumb or room chip | Hash `#walk-pN`. Tab to thumbs, Enter. Current thumb has a visible outline, not colour-only, plus hidden “נוכחי”. |
| התמונה הבאה | Next hash, cycles. The large `img` alt updates because a different figure is `:target`. |
| כל התמונות | Jump to `#listing-gallery`. |
| סיור תלת־ממד | New tab if `media.tourUrl` is set. Announce “נפתח בחלון חדש”. Poster is the cover. No iframe. |
| Sticky WhatsApp | Always visible, does not cover the last line (`padding-block-end` ~7rem). Min hit **44×44**. `focus-visible` 3px. Link goes via `/a/[slug]/wa` then `wa.me`. |
| Sold listing | Banner, no dock. |

Do not: auto-play, hover-only affordances, Compare, a search drawer, a purple 3D knob.

`walkFirst` puts the walk above the price via flex `order` when rooms are labelled. A vehicle with no rooms omits the walk and keeps the hero.

## Agent — editor `/new`

One job per step. Errors are **inline under the field**, `role="alert"` on submit, never only a toast. Photo order is RTL (index 0 = rightmost), with keyboard move buttons. Alt is optional. Template picker shows five live miniatures; selecting one restyles preview immediately (`data-template`). Unpaid: they reach preview. Publish explains the grant/paywall in Hebrew. Draft survives in the database.

## Agent — dashboard `/mine`

Default card: cover, title, status, **views**, **WhatsApp taps**, days since publish. Filters: all / draft / published / sold / archived — keyboard radios. Primary actions: copy link, share kit, mark sold. Archive is second and asks once. Empty: “עדיין אין מודעה” + CTA to `/new`.

Not a Kanban of offers. Not CAD totals. Not Hudson 8 CRM.

## Homepage `/`

Forty-second agent in sunlight: **one** headline, **one** CTA (לבנות מודעה), then proof (five live template miniatures), then **price strip**, then one closing line. Logged-out: כניסה לחשבון. Logged-in: המודעות שלי. Mini-screens link to `/template-check/{id}/`. CSS cycle stays inside `prefers-reduced-motion: no-preference`.
