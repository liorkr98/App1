# The processing pipeline

Six job types, two Fly process groups, one Postgres queue. ADR 0001 has the
runtime reasoning; ADR 0002 has the stitching decision. This file is the map.

## Job types

| type | group | input | output |
| --- | --- | --- | --- |
| `enhance_images` | worker | originals | four WebP widths per photo |
| `stitch_panorama` | worker | shots + attitude | one equirectangular per room |
| `extract_frames` | worker | walk-around video | 36 frames, angularly resampled |
| `build_sprite` | worker | those frames | one 6x6 sheet |
| `generate_og` | worker | cover photo | the 1200x630 WhatsApp card |
| `render_pdf` | **pdf** | the published page | a print-ready PDF |

`scope_key` carries the scene id for `stitch_panorama` and is null everywhere
else. That is what lets one room fail without taking the tour with it (D7): a
failed job never gates publishing, it just leaves that scene out.

The two groups claim **disjoint** job types. Chrome is the only thing here that
routinely runs out of memory, and when it does it takes its machine with it.

## Writing results back

Rooms stitch concurrently. Every write into `listings.media` therefore goes
through an RPC in `supabase/migrations/0005_attach_immersive.sql`, which merges
under a row lock. A read-modify-write from the worker would drop whichever
scene finished second, intermittently.

`attach_pano_scene` is idempotent by scene id, so a retry replaces rather than
duplicates. `payloadMb` is recomputed from the scenes on every call rather than
accumulated, so a retry cannot inflate the number the seller sees.

## What CI proves, and what it does not

The verify workflow runs the worker's typecheck and its unit tests. Those tests
cover the pure arithmetic: the projection and blending maths, the angular
resampling, the Hebrew detection, and the sprite grid.

**CI does not run the pipeline.** It has no sample video, no Supabase project,
no libvips-sized machine and no browser. Specifically, none of the following
has been executed anywhere yet:

- a real stitch, end to end, against real phone shots;
- ffmpeg frame extraction against a real walk-around video;
- a Puppeteer render, and therefore the Hebrew-in-PDF check that is the whole
  point of `src/pdf/verify.ts`;
- any measurement of how long a stitch takes, or how much memory it uses.

The inner loop of the stitcher visits every output pixel once per shot —
roughly 84 million times for a ten-shot room at 4096x2048. It is written for
legibility, leaning on V8 to eliminate the small allocations in that loop.
**That has not been measured.** If stitching turns out to be slow, that loop is
where to look first, and the fix is to inline the transpose and the projection
so nothing is allocated per pixel.

The one cross-boundary invariant that *is* checked mechanically is the sprite
layout: `scripts/verify-sprite-layout.mjs` compares the pipeline's `gridFor`
against the viewer's, because a mismatch there produces a spin that shows the
wrong frame while breaking nothing.

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

`no_cover`, `no_sources`, `no_scene`, `no_shots`, `no_frames`, `no_video`,
`no_slug`, `path_outside_listing`, `source_unreadable`, `video_unreadable`,
`frame_unreadable`, `incomplete_sweep`, `insufficient_coverage`,
`page_unavailable`, `pdf_missing_hebrew`, `no_handler`.

Retryable — transient, worth another attempt with backoff:

`upload_failed`, `listing_update_failed`, `attach_*_failed`,
`frame_extraction_failed`, `pdf_render_failed`, `internal_error`.

`attempts` increments at **claim**, not at failure. A worker killed mid-job
reports nothing, so counting at failure would let a job that crashes the
process retry forever.
