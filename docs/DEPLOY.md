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

## Cloudflare build settings — the one that bit us

A deploy on 8 September 2026 failed with:

    CommandError: ... Install react-native-web@^0.21.2
    Command failed with exit code 1: bunx expo export -p web

Cloudflare had auto-detected the repository as an Expo app and was building a
React Native web export. It is an **Astro static site in `web/`**.

The detection is not going to stop on its own: `expo` is still a root
dependency and `app.config.ts` is still present, both deliberately, as the
anchor for the EAS project (CLAUDE.md §2). So the configuration has to be
explicit.

### In the repository — done

`wrangler.jsonc` is committed. It pins the asset directory to `web/dist` and
stops `wrangler deploy` running its auto-configuration at all.

### In the Cloudflare dashboard — YOU need to set this

The build command is a dashboard setting and cannot be committed. Set it to:

```
npm install --prefix web --no-audit --no-fund && npm run build --prefix web
```

The `--prefix web` on the install matters. `web/` has its own package.json and
is deliberately NOT an npm workspace (CLAUDE.md §3), so a root install does not
fetch Astro. Without it the build command fails on a missing `astro`.

Leave the deploy command as `npx wrangler deploy`.

### Why not just delete the Expo remnant

Because it is the EAS project anchor, and EAS is the fallback CI. Removing it
to satisfy a framework detector would trade a settings change for the loss of a
build path. The explicit config is the cheaper fix.

---

## What is not deployed here

### The PDF route

`/a/{slug}/pdf` is still a stub. The PDF itself is real — the worker renders
it from this very page and writes the result to `listings.media.pdfUrl` — but
this site builds with `output: static`, where an endpoint keeps its body and
loses its status and headers. A redirect from that route would produce an empty
file, not a redirect.

A stable `/a/{slug}/pdf` link therefore needs either on-demand rendering or a
generated redirect map, and both belong with the change that makes these pages
read from Supabase instead of the fixtures in `web/src/lib/listings.ts`.

The listing page does not link to the PDF yet either. Putting a download
control on it is a design change to a template held to a byte-identical CSS
contract, and that is a decision to take deliberately rather than in passing.

### The worker

The pipeline is not part of this deploy. It runs on Fly (`docs/PIPELINE.md`),
and it needs one value from here:

```
PAGE_BASE_URL   the origin Cloudflare Pages serves, e.g. https://listings.example.com
```

Set it on the Fly app once the domain is fixed. Until it is set, the pdf
process group refuses to start rather than rendering something wrong — which is
the intended behaviour, not a bug to work around.
