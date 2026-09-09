# ADR 0001 — Worker runtime and job queue

**Status:** accepted, September 2026
**Decision by:** product owner
**Applies to:** Stage D, the backend pipeline

Recorded here rather than in the build prompts because the prompts get
superseded and this reasoning does not. Whoever reads `fly.toml` in six months
needs the *why*, not the instruction that produced it.

---

## Decision

**A container host — Fly.io — with the queue in Supabase Postgres. Not
serverless.**

---

## Why not serverless

Three jobs need native binaries: `sharp`/libvips, `ffmpeg`, and Chrome.

- **Supabase Edge Functions** are Deno with no native binaries. Ruled out.
- **Cloudflare Workers** — same. Ruled out.
- **Lambda in container mode** technically works, but the 15-minute ceiling,
  heavy cold starts and operational overhead are not justified for a solo
  developer.

Panorama stitching decides it: a feature-matching stitcher is a large binary
and minutes of CPU per scene. That alone requires a container.

## Why Fly.io over Railway or Render

Scale-to-zero with a cold start measured in seconds — we pay when there is
work. Render does not scale background workers to zero, so we would pay for an
idle machine most of the day during the early months.

## Queue: Postgres, not Redis and not SQS

```sql
SELECT * FROM jobs
WHERE status = 'queued' AND next_attempt_at <= now()
ORDER BY created_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

Sufficient for the volume, and it gives three things for free:

1. **One transaction.** Job state and listing state commit together. There is
   no window where the job succeeded and the listing does not know it.
2. **Idempotency enforced by the database.** A unique index on
   `(listing_id, job_type, input_hash)` — the key Stage D already specifies.
   The database enforces it, not application code.
3. **Progress reporting for free.** The worker updates a `progress` column;
   the app subscribes to its own job rows through Supabase Realtime. No
   WebSocket server of ours, and no polling. This is the strongest argument
   against introducing Redis.

Retries use `attempts` and `next_attempt_at` with exponential backoff.

## Puppeteer: same image, separate process group

Chrome is memory-hungry and it crashes. If PDF rendering shared a process with
stitching, a Chrome OOM would kill a panorama job mid-run.

Same Docker image, two Fly process groups:

- **`worker`** — image enhancement, stitching, ffmpeg. Concurrency 2–3.
- **`pdf`** — Puppeteer only. Concurrency 1, memory capped, aggressive restart.

A few lines in `fly.toml`, and it prevents a class of bug that is very hard to
diagnose.

The PDF is generated **as a job at publish time and stored**. `/a/{slug}/pdf`
serves an existing file. Cold-starting Chrome per request would spend 2–4
seconds we do not need to spend.

## Cost

`shared-cpu-2x`, 2GB, scale-to-zero: roughly $5–15/month at early volume.
Negligible next to the image processing cost itself (`RESEARCH.md` §7).

## Not the developer's machine

Development and debugging of Stage D only. It cannot be the deployment target:
no uptime, no stable IP, and the pipeline stalls whenever the laptop closes.

## What would change this

If panorama stitching later moves to an external API the heavy CPU need
shrinks — but `ffmpeg` and Puppeteer still require a container. The decision
holds either way.

---

## Consequences

- A third codebase, `worker/`, alongside the Expo app and the Astro site.
- The service-role key lives in Fly secrets. It is never in the repo, never in
  an `EXPO_PUBLIC_*` variable, and never reaches the client (CLAUDE.md §8).
- The worker bypasses RLS by design, which is why users have **no** write
  policy on `jobs` — see `supabase/migrations/0003_jobs.sql`.
- Stage D acceptance cannot be verified from the development machine: it needs
  the container running against the real project. The checks are written to be
  runnable; their results are not assumed.

---

## Amendment — September 2026

RESEARCH.md v2 defers immersive capture (§9), so `ffmpeg` left the image and
stitching left the `worker` group. Read every mention of them above as
historical.

**The decision does not change.** `sharp`/libvips and Chrome each still need a
container with native binaries and more memory than an edge function gets, and
the queue argument never depended on the video work at all. Had the remaining
jobs been small enough for serverless, this is where that would be
reconsidered — they are not.
