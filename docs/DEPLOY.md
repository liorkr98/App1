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

**`SITE_URL` overrides the host. The fallback is now the real one.**

`CF_PAGES_URL` is set by Cloudflare **Pages**. This site deploys as a
**Worker**, and Workers Builds does not set it — so with neither variable
present, every `og:image` on the deployed site read
`https://example.com/...`. That was live and undetected: the build succeeded,
every check passed, and the one URL the whole distribution model rests on was
a placeholder.

It is a **BUILD** variable, not a runtime one. Cloudflare refuses runtime
variables on a Worker that only serves static assets, and it is right to:
nothing looks this up when a page is served. Astro reads it while building and
bakes the result into the files.

So it goes in **Settings → Build → Variables**, beside the build command — not
the Runtime panel. Editing it does not rebuild on its own; retry the
deployment afterwards.

Set it to the origin the site is served from:

    SITE_URL = https://hasivuv.com

Until the custom domain is attached the workers.dev origin is correct, and it
is also the built-in fallback — so a build with no variables set produces
working links rather than broken ones. It must be the ORIGIN only: scheme and
host, no trailing path.

**The fallback used to be `https://example.com`.** That shipped: every preview
card and every share message on the live site pointed at a domain nobody owns,
and every check passed while it did. A placeholder default is never the right
answer for a value whose only job is to be correct.

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

### The deploy command, and the thing it gets wrong

**Do NOT leave the deploy command as a bare `npx wrangler deploy`.** That is
what it was set to, and it is why the "Workers Builds: besivov" check has
failed on every pull request this repository has ever opened.

`wrangler deploy` targets **production**. Cloudflare runs the deploy command on
non-production branches too when non-production branch builds are enabled, and
its own default there is `wrangler versions upload` — a preview version with
its own URL, which does not touch what the public is looking at. Overriding
that with `wrangler deploy` means every branch build either fails or, worse,
publishes an unmerged branch to the live site.

Two ways to fix it. Pick one:

**A. Turn non-production branch builds off.** Settings → Build → Branch
control. Simplest, and GitHub Actions already verifies pull requests. You lose
preview URLs.

**B. Make the command branch-aware.** Keep the previews and stop the failures:

```
if [ "$WORKERS_CI_BRANCH" = "main" ]; then npx wrangler deploy; else npx wrangler versions upload; fi
```

`WORKERS_CI_BRANCH` is set by Workers Builds on every run. **B is the better
answer** — a preview URL per pull request is the only way to look at a change
on a real device before it is merged, and this is a product whose whole output
is a page viewed on a phone.

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
