# Deploying the listing pages

The `web/` workspace is Astro. Homepage, editor, legal and the CI fixtures
prerender; `/a/[slug]`, `/share`, `/sitemap.xml` and `/pdf` run on the Worker
at request time so a real listing exists without a rebuild.

It deploys to Cloudflare Workers from GitHub. `wrangler.jsonc` at the repo
root is the config — do not let the dashboard auto-detect Expo.

---

## amudsell.com — the domain, and HTTPS (12 Oct 2026)

The product is **עמוד מכירה** and its canonical host is **https://amudsell.com**.
The build bakes that host into every canonical link, `og:image`, sitemap and
share message (`web/astro.config.mjs`), so **attach the domain before a build
from this branch deploys**, or every preview card points at a host that does
not answer.

### 1. Attach it to the Worker (once)
1. The domain's nameservers point at Cloudflare (registrar → nameservers →
   the two Cloudflare gives you when you add the site).
2. **Workers & Pages → besivov → Settings → Domains & Routes → Add → Custom
   domain:** `amudsell.com`, then again for `www.amudsell.com`. Cloudflare
   creates the DNS records and issues the certificate itself.
3. **Settings → Build → Variables:** delete `SITE_URL` if it still names the
   workers.dev host (the fallback is now amudsell.com), or set it to
   `https://amudsell.com`. Retry the deployment.
4. Supabase → **Authentication → URL Configuration:** Site URL
   `https://amudsell.com`, and add `https://amudsell.com/enter/` to the
   redirect URLs, or sign-in links land on the old host.

### 2. HTTPS settings (zone amudsell.com → SSL/TLS)
| Setting | Value | Why |
|---|---|---|
| Encryption mode | **Full (strict)** | Cloudflare to the Worker is verified end to end |
| Edge Certificates → Always Use HTTPS | **On** | every http:// request gets a 301 to https:// |
| Edge Certificates → Minimum TLS Version | **1.2** | 1.0/1.1 are broken and no supported phone needs them |
| Edge Certificates → TLS 1.3 | **On** | |
| Edge Certificates → Automatic HTTPS Rewrites | **On** | |
| Edge Certificates → HSTS | leave **off** here | the site sends its own (below); two sources disagree sooner or later |

### 3. One host, not three (Rules → Redirect Rules)
- **www → apex:** a Redirect Rule, "Redirect from WWW to root" template,
  301, keep the query string.
- **workers.dev → amudsell.com:** once the domain answers, either turn off
  the workers.dev route (Settings → Domains & Routes) or keep it for
  testing. Every page already names amudsell.com as its canonical, so search
  engines index that host either way. The phone-upload QR accepts both.

### What the repo does by itself
Every response carries the same security headers, from one list
(`web/src/lib/security-headers.json`): `_headers` for the static pages
(`web/integrations/security-headers.mjs`), the middleware for what the
Worker renders (`web/src/middleware.ts`). `scripts/verify-security-headers.mjs`
checks the built file in CI, with its fires proof.

- **HSTS** for a year with `includeSubDomains`. **No `preload`:** that submits
  the domain to the browsers' built-in list, and leaving it takes months. Add
  it, and submit at hstspreload.org, only once you are sure every subdomain
  you will ever use speaks https.
- `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, a referrer policy
  that never hands another site a full listing URL, no camera, microphone or
  location for anyone, `Cross-Origin-Opener-Policy`.
- A CSP limited to what cannot break a page: framing, `<base>`, plugins,
  form targets, and `upgrade-insecure-requests`. A script policy needs every
  inline script hashed first; it is a follow-up, not a guess.

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

    SITE_URL = https://amudsell.com

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

- **A real photograph as the cover.** The two demo listings (`/a/A7K2M`,
  `/a/V3M9Q`) use CC0/public-domain WebP files in `web/public/sample/` — see
  `docs/SAMPLE-IMAGES.md`. They are no longer placehold.co rectangles.
- **A real host.** Send `https://amudsell.com/a/A7K2M/` (the workers.dev
  host until the domain is attached). WhatsApp needs a public
  HTTPS URL; localhost tests nothing.
- **Three phones.** Send it to yourself and two other people, and look at
  the card **on their phones**. This change does not perform that test —
  there is no WhatsApp session here.

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

`wrangler.jsonc` is committed at the **repo root** (so Workers Builds does
not guess Expo) and a second copy lives in `web/` for the Astro adapter.

- **Root** `wrangler.jsonc` — `main` is `web/dist/server/entry.mjs`, assets
  are `web/dist/client`. Wrangler reads this **after** `astro build`.
- **`web/wrangler.jsonc`** — `main` is `@astrojs/cloudflare/entrypoints/server`,
  which exists as soon as `web/` is installed. `astro check` and `astro build`
  read this one. Pointing the adapter at the built entry made CI fail on a
  clean machine: the Vite plugin resolves `main` when the config loads.

### The build output moved — 14 September 2026

`/a/[slug]` is rendered per request now, so a real listing has a page at all
(astro.config.mjs explains why that beats rebuilding on every publish). The
adapter therefore splits the output:

```
web/dist/client   every prerendered page, plus /_astro and /_headers
web/dist/server   the Worker that renders the listing route
```

`wrangler.jsonc` points at both, and adds `nodejs_compat` — without it
`@supabase/supabase-js` fails at import time, before any request is handled.

**Run wrangler from the REPOSITORY ROOT, not from `web/`.** The adapter writes
`web/.wrangler/deploy/config.json` pointing at its own generated config, and
wrangler refuses to start when that and the committed root config do not share
a base path:

```
✘ [ERROR] Found both a user configuration file at "../wrangler.jsonc"
  and a deploy configuration file at ".wrangler/deploy/config.json".
```

Cloudflare's build already runs from the root, so this only bites when testing
by hand. `npx wrangler deploy --dry-run` from the root is the check.

### In the Cloudflare dashboard — YOU need to set this

The build command is a dashboard setting and cannot be committed. Set it to:

```
npm install --prefix web --no-audit --no-fund && npm run build --prefix web
```

`npm run build` at the ROOT now does the same thing, so either works. That
script exists for this reason alone: the root package.json had no `build`
script at all, so the most obvious thing anyone would type into that field —
and a common Cloudflare default — failed with "missing script: build" and sent
the reader looking for a problem in the web workspace.

`wrangler.jsonc` now runs `npm run build` itself when `web/dist/server/entry.mjs`
is missing, so an empty dashboard field still produces a Worker. Set the field
anyway — it is the documented place, and it keeps the build off the deploy
timer. The wrangler fallback is what stops an empty field from looking like a
broken `main` path.

**IT HAS TO BE SET, AND AN EMPTY FIELD USED TO FAIL IN A CONFUSING WAY.** The build of
12 September 2026 went:

```
Detected the following tools from environment: bun@1.2.15, nodejs@24.18.0
Installing project dependencies: bun install
...
Executing user deploy command: npx wrangler versions upload
✘ [ERROR] The directory specified by the "assets.directory" field in your
  configuration file does not exist:
    /opt/buildhome/repo/web/dist
```

Read it twice: there is no build step between the install and the deploy. With
the field empty Cloudflare runs its own dependency install — `bun install`, at
the REPOSITORY ROOT, because that is where the package.json it found lives —
and then goes straight to deploying. A root install does not fetch Astro
(CLAUDE.md §3: `web/` is deliberately not an npm workspace), nothing ever runs
`astro build`, and `web/dist` is never created.

The error names `assets.directory`, which points the reader at
`wrangler.jsonc` — a file that is correct. **The missing thing is the build
command, not the asset path.**

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

### Build secrets are not the Worker

Settings → Build → Variables and secrets is the build environment.
`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` and `SITE_URL` belong
there, because Astro inlines them. `DEEPSEEK_API_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` do not: the photo check and the phone upload
read them from the Worker at request time. A key that lives only in the
build list is invisible on the site (`no_key`, and phone upload
`not_configured`).

**Put them on the Worker, by hand, once:** besivov → Settings → Variables
and Secrets → Add → Type *Secret*, then Deploy. They survive every later
deploy. Then delete them from the Build list.

From 11 to 12 Oct 2026 a build step (`scripts/bind-worker-secrets.mjs`)
copied them from the build list onto the Worker on every deploy. It was
removed: it put the database master key into every build, preview branches
included, and it re-wrote the build copy over the Worker copy each time — so
a key pasted wrong in the build list (measured: Supabase answered
`Invalid API key`, `bad_length`, to every phone upload) could not be
corrected on the Worker. `/admin` now has a line for each key and says
which one is refused.

### Why not just delete the Expo remnant

Because it is the EAS project anchor, and EAS is the fallback CI. Removing it
to satisfy a framework detector would trade a settings change for the loss of a
build path. The explicit config is the cheaper fix.

---

## What is not deployed here

### The PDF route

`/a/{slug}/pdf` is on-demand. If the worker has written `listings.media.pdfUrl`
it 302s there; otherwise it returns Hebrew text with 503. The listing page
still does not link it: putting a download control on the page is a design
change to a template held to a byte-identical CSS contract.

### On-demand listing pages

`/a/[slug]` and `/a/[slug]/share` load published (and sold) rows from Supabase
via the publishable key. Demo slugs `A7K2M` and `V3M9Q` still render from
fixtures. CI builds the same tree at `/template-check/{slug}`, which is
noindex and disallowed in `robots.txt`.

### The worker

The pipeline is not part of this deploy. It runs on Fly (`docs/PIPELINE.md`),
and it needs one value from here:

```
PAGE_BASE_URL   the origin the listing pages are served from, e.g. https://amudsell.com
```

Set it on the Fly app once the domain is fixed. Until it is set, the pdf
process group refuses to start rather than rendering something wrong — which is
the intended behaviour, not a bug to work around.

Publish already enqueues `enhance_images` and `generate_og`. Those jobs sit in
Postgres until the Fly app is running.
