# The processing pipeline

Three job types, two Fly process groups, one Postgres queue. ADR 0001 has the
runtime reasoning. This file is the map.

Three more job types — `stitch_panorama`, `extract_frames`, `build_sprite` —
lived here and are gone. Immersive capture is deferred by RESEARCH.md v2 §9:
sequenced, not cancelled. The code is at the `immersive-v1` tag and 0006 drops
the two database functions it wrote through.

## Job types

| type | group | input | output |
| --- | --- | --- | --- |
| `enhance_images` | worker | originals | four WebP widths per photo |
| `generate_og` | worker | cover photo | the 1200x630 WhatsApp card |
| `render_pdf` | **pdf** | the published page | a print-ready PDF |

`scope_key` is null on all three today. It exists because a failed job must
never gate publishing — a listing publishes with whatever succeeded — and
because per-item work will need it again.

The two groups claim **disjoint** job types. Chrome is the only thing here that
routinely runs out of memory, and when it does it takes its machine with it.

## Writing results back

Writes into `listings.media` go through an RPC rather than a read-modify-write
from the worker, so two jobs on the same listing cannot lose each other's
changes. Only `attach_pdf` remains; 0006 drops the panorama and spin merges
that went with the deferred immersive work.

`generate_og` writes `og_image_hash` directly, which is safe because it is the
only writer of that column.

## What CI proves, and what it does not

The verify workflow runs the worker's typecheck and its unit tests. Those tests
cover the Hebrew detection used by the PDF check. The panorama and resampling
maths went with the deferred work, and took most of the unit coverage with it —
what remains is thinner than it was, and worth saying rather than glossing.

**CI does not run the pipeline.** It has no sample video, no Supabase project,
no libvips-sized machine and no browser. Specifically, none of the following
has been executed anywhere yet:

- a single image enhancement against a real photograph;
- an Open Graph crop, and therefore the 300KB quality ladder;
- a Puppeteer render, and therefore the Hebrew-in-PDF check that is the whole
  point of `src/pdf/verify.ts`;
- any measurement of how long a job takes or how much memory it uses.

Every timing and memory figure in this file and in the code comments is a
design intent, not a measurement.

## Known risk: Chrome runs without its sandbox

The `pdf` group launches Chrome with `--no-sandbox`, because Chrome's own
sandbox needs user namespaces the runtime does not grant. The container is the
boundary instead: unprivileged user, nothing on disk worth taking.

That is not nothing, though. **This process holds the Supabase service-role key
in its environment, and it renders pages containing seller-supplied text.** A
renderer escape would reach a credential that bypasses RLS entirely.

The clean fix is a scoped key for the pdf group, which Supabase does not offer
today. Two things that would reduce the blast radius meanwhile, neither done:

- give the pdf group its own database role with rights to `jobs` and to
  `listings.media` only, reached through a connection string rather than the
  service-role key;
- render from a URL allowlist so a compromised job payload cannot point Chrome
  at an arbitrary origin.

Recorded here rather than left implicit, because it is the sharpest edge in the
system and it is invisible from the code that causes it.

## Configuration

Set on the Fly app. None of it is in the repo.

| variable | group | notes |
| --- | --- | --- |
| `SUPABASE_URL` | both | |
| `SUPABASE_SERVICE_ROLE_KEY` | both | bypasses RLS; never reaches a client |
| `PAGE_BASE_URL` | pdf | the deployed listings origin, e.g. `https://…` |
| `IDLE_POLL_MS` | both | queue sleep when empty |
| `STALE_CLAIM_MS` | both | a claim older than this is treated as abandoned |

`PAGE_BASE_URL` is deliberately unset in `fly.toml`. It is not a secret, but
nobody knows the value until Cloudflare Pages is connected (`docs/DEPLOY.md`),
and a wrong one would quietly render 404 pages into PDFs.

## Failure taxonomy

Permanent — the queue does not retry, because the same input produces the same
result:

`no_cover`, `no_sources`, `no_slug`, `path_outside_listing`,
`source_unreadable`, `page_unavailable`, `pdf_missing_hebrew`, `no_handler`.

Retryable — transient, worth another attempt with backoff:

`upload_failed`, `listing_update_failed`, `attach_pdf_failed`,
`pdf_render_failed`, `internal_error`.

`attempts` increments at **claim**, not at failure. A worker killed mid-job
reports nothing, so counting at failure would let a job that crashes the
process retry forever.
