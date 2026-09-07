# Deploying the listing pages

The `web/` workspace is a static Astro site. It deploys to Cloudflare Pages
straight from GitHub — no CLI, no API token, nothing that has to pass through
a chat window.

---

## One-time setup

In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to
Git**, pick `liorkr98/App1`, then:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| **Root directory** | **`web`** |
| Node version | 22 or later |

**Root directory is the one that catches people.** The repo root is the React
Native app; its `package.json` has no `build` script and no Astro. Pointing
Pages at the root will fail with a confusing error about a missing script.

Nothing else is required. `web/` has its own `package.json`, so Pages installs
only the site's dependencies, not the mobile app's.

---

## The site URL, and why it matters

`astro.config.mjs` reads, in order:

```
SITE_URL  →  CF_PAGES_URL  →  https://example.com
```

Cloudflare sets `CF_PAGES_URL` automatically on every build, so **production
and preview deploys each get a correct absolute `og:image`** with no
configuration. Preview branches produce working WhatsApp cards too, which is
what makes the card testable before anything is live.

Set `SITE_URL` as an environment variable only when a custom domain is
attached — otherwise the cards would point at the `.pages.dev` host forever.

This matters because **WhatsApp rejects a relative `og:image`** and renders a
card with no picture. Getting the host wrong does not produce an error
anywhere; it produces a card nobody taps.

---

## The OG image, before and after Stage D

Right now no OG image is generated. `ogImageUrl()` falls back to the cover
photo, so the card carries a picture — the wrong aspect ratio, which WhatsApp
centre-crops, but a cropped photo beats an empty grey card by a wide margin.

Stage D generates a proper 1200×630 WebP under `/og/{slug}-{hash}.webp` and
sets `listing.ogImageHash`. The page then uses it automatically; no template
change.

The hash is in the **filename**, never a query parameter. WhatsApp caches
preview cards aggressively and some scrapers strip query strings entirely, so
`?v=2` busts nothing — a seller edits their price and the stale card is served
for days. A new filename is a new resource.

---

## Testing the card — the gate

From `RESEARCH.md` §11, this is the test everything else is downstream of.

1. Deploy, and open `/a/{slug}` to confirm the page renders.
2. Send the link **to yourself** on WhatsApp. Look at the card.
3. Send it to **two other people** and look at it **on their phones**, not
   yours. Your phone may have the page cached; theirs will not.
4. Watch what they do first.

If the card looks bad, stop and fix it before Stage C. Every remaining stage
assumes someone taps.

### Before the gate means anything

- **A real photograph as the cover.** The sample listings use `placehold.co`
  grey rectangles. A card showing a grey box tests nothing.
- **A real host**, which the Pages deploy provides.

### Re-testing after a change

WhatsApp caches hard. To force a fresh scrape, change the content hash — which
in practice means the cover photo or the price changed, so the filename
changed. Appending a query string will not work.

---

## What is not deployed here

The `/a/{slug}/pdf` route is a Stage D stub returning 501. It exists so links
to it fail with a message rather than a 404 that reads like a broken deploy.
