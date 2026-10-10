# Parked: AI photo check + video on a listing

**Status: parked, 10 Oct 2026, by the owner's call.** This file exists so the
work can resume without rediscovery. Nothing here is built. Both halves were
planned in detail and the owner's decisions are recorded below — do not ask
them again; ask only what changed.

Neither half touches billing (CLAUDE.md §8).

---

## 1. AI photo check, with the owner's Mac as the processor

### Decided
- **No paid vision API, no credits.** The owner's own computer runs a free
  open model through **Ollama**. DeepSeek (the description model) cannot see
  images.
- **The machine is a Mac with an Intel chip**: CPU only, so a small model
  (`gemma3:4b`, ≈3.3 GB) and a measured, honest speed — expect roughly
  30–90 s per photo, to be measured on the first run, not assumed. If it is
  too slow, the fallback is a room-only classifier.
- **The AI labels rooms itself**, only on unlabelled photos and only when
  confident; the agent can change it; a room the agent set is never
  overwritten (`docs/PHOTO-TOUR.md` "Recognition, later").
- **Advice never blocks publishing** — same rule as `photo-guidance.ts`.

### Design
- **The queue already exists**: the `jobs` table, `enqueue_job` (callable by
  the owner) and `claim_job` (service role), migrations 0003 and 0024.
  - The editor enqueues `review_photos` after an upload batch.
  - The job is keyed by the photo list, so the same set is never re-checked.
- **`worker/` runs on the Mac** with a new handler,
  `worker/src/handlers/review-photos.ts`. It runs only that job type, via
  `npm run review --prefix worker`. For each job it:
  1. reads the listing's photo URLs from the row;
  2. checks that each URL is inside that listing's folder (§9);
  3. downloads the EXIF-stripped public copies and shrinks them to ≈768 px;
  4. calls Ollama on localhost with plain `fetch` (no npm dependency), with a
     JSON-schema `format` and thinking off;
  5. writes results per photo as they finish.

  The model returns:

  | Field | Values |
  |---|---|
  | `room` | `PHOTO_ROOMS` plus a confidence |
  | `issues` | `dark`, `blurry`, `tilted`, `sideways`, `portraitCover`, `clutter`, `person`, `documents`, `plate` (cars, §7), `blownWindow`, `tooClose` |
  | `tip` | one of a fixed set of retake tips |
  | `score` | 1–5 |

  Hebrew wording comes from `locales/`, never from the model. An answer that
  does not parse means no label and no advice — never a guess.
- **Migration** (next free number):
  - adds the `review_photos` job type;
  - creates a `photo_reviews` table, owner-select RLS;
  - adds an `attach_photo_review` function the service role alone may call
    (the `attach_media_url` pattern from 0034).

  A separate table, NOT a `listings` column: a column would be readable
  through a published listing's public row.
- **In the editor**, per photo:
  - issue chips with a retake tip;
  - "use as cover" on the best-scoring photo;
  - one-tap rotate for a sideways photo;
  - "AI check: waiting for the computer" when the job is still unclaimed
    after a few minutes, because the Mac is off.

  Room labels feed the room checklist (`photo-coverage.ts`).
- **One-time owner setup** — to be written as `docs/LOCAL-AI.md`:
  1. install Ollama and run `ollama pull gemma3:4b`;
  2. create `worker/.env` on the Mac with the Supabase service key — the
     owner creates it, it is never committed;
  3. optionally, a launchd auto-start.

  The migration is applied in the Supabase SQL editor.

---

## 2. Video on a listing

### Decided
- **Upload to our storage; plays only on tap.** `preload="none"` and a poster
  frame, so a buyer who does not tap costs no video download (egress).
- **1 video per listing, ≤ 60 s, ≤ 50 MB** (Supabase's default per-file cap).
- **In the gallery, as the 2nd tile**, full width, in every template. That
  is no new divergence: the 4-divergence gate is unchanged.
- **Free for everyone** — no entitlement code.

### Design
- **The GPS problem (§9).** Phone videos carry the capture location in their
  metadata, and a video cannot be redrawn on a canvas the way photos are.
  - `src/features/listings/video-strip.ts` (pure, unit-tested) walks the
    MP4/MOV boxes and renames every `udta`, `meta` and top-level `uuid` box
    to `free`. That is the same 4 bytes and the same sizes, so every offset
    stays valid and the file still plays.
  - Only the `moov` index is read and patched; the upload is assembled from
    the patched index plus slices of the untouched file.
  - **Fail closed**: if `©xyz`, `ISO6709` or `com.apple.quicktime.location`
    is still present, the upload is refused.
  - The same pass reads the duration (`mvhd`, for the 60 s cap) and the codec
    (`stsd`: H.264 or HEVC).
- **The poster frame** is grabbed at ≈1 s into a canvas and saved as WebP —
  pixels only, so no metadata. If that fails, the cover photo is the poster.
- **Storage paths**: `{listingId}/browser/video-{stamp}.mp4` (served as
  `video/mp4`) and `…-poster.webp`. The 0023 policy already allows them, so
  no migration. The original is not kept.
- **Data**: `Media.video = { url, posterUrl?, width, height, seconds, codec }`.
  - written through `MediaExtras` / `toMedia`;
  - `asMedia` accepts it only from our storage under `/{listingId}/browser/`;
  - `preview.ts` checks it with `allowedPreviewUrl`.
- **On the page**: native
  `<video controls playsinline preload="none" poster>` in `Gallery.astro`.
  No new JavaScript, so the listing JS budget is untouched. Height is capped
  at 70svh with `object-fit: contain`. The caption reads
  "סרטון · <bdi>0:42</bdi>".
- **HEVC** (the iPhone default) may not play on some Android phones. The
  editor shows a note — Settings › Camera › Formats › Most Compatible — but
  the upload is still allowed.
- **Also**:
  - the homepage's `Video` tile becomes live;
  - CLAUDE.md §2 gains a Video row and §9 gains the box-rename rule.

### Not verifiable in a sandbox
- real iPhone and Android uploads;
- HEVC playback on Android;
- whether the live `derived` bucket has a size or MIME limit that refuses
  video. If it does, it is one bucket setting.
