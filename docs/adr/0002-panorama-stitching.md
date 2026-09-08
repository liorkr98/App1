# ADR 0002 — Orientation-based panorama stitching

Status: accepted (Stage D-b)
Supersedes: nothing. Extends ADR 0001, which chose the runtime.

## Decision

Panoramas are stitched by **projecting each shot onto an equirectangular
canvas using the device orientation recorded at capture time**. No feature
detection, no bundle adjustment, no Hugin in the hot path.

The maths is in `worker/src/pano/project.ts` and is unit-tested. The pixel
work is in `worker/src/handlers/stitch.ts`.

## Why not feature matching

Hugin, OpenCV stitching and every hosted equivalent solve a harder problem than
we have: they recover the camera orientation *from the pixels*, because they
are handed a pile of photographs with no metadata. We are not. The capture flow
puts the phone's attitude on every shot, so the geometry is known before a
single pixel is compared.

Paying for that solved problem costs three things:

1. **It fails on rooms.** Feature matching needs texture to lock onto. A blank
   wall, a plain ceiling, a glass balcony door and a mirror are the four
   surfaces a residential interior is mostly made of, and they are exactly the
   cases where control points are sparse or wrong. A failure here is not a
   crash — it is a panorama with a bent doorframe.
2. **It is slow and it is another runtime.** Hugin is a native toolchain in the
   image, invoked as a subprocess, with its own failure modes and its own
   memory profile, on a machine sized for sharp.
3. **It is not more accurate here.** Phone attitude is good to a degree or so.
   At 4096x2048 that is about eleven pixels of error, which the feathered blend
   absorbs. Feature matching would beat that only where it works.

## What we give up, stated plainly

- **Parallax is not corrected.** Rotating a phone about the wrist rather than
  about the lens shifts the viewpoint by a few centimetres, and near objects
  therefore do not line up perfectly with far ones. Feature matching would not
  fix this either — it needs depth, not better correspondence — but it would
  hide it better by warping the seam. Ours shows a soft double edge on a door
  handle a metre from the lens.
- **A bad heading track produces a bad panorama, silently.** If the compass is
  disturbed — and a fridge, a steel door or an underfloor heating loop will do
  it — the shots land in the wrong place and the result is scrambled rather
  than blurry. The equatorial-coverage gate catches the gross case (a hole in
  the band the viewer looks at) but not a shot that landed 30 degrees off.
- **The poles are not photographed.** Nobody points a phone at the ceiling.
  Those bands are filled with the average colour of the nearest captured row,
  which is deliberately detail-free — see below.

## The fallback

Hugin stays the documented escape hatch. If a category of capture turns out to
defeat orientation-based projection — a phone with an unreliable magnetometer,
say — the shape of the fix is: add a `stitch_panorama_hq` job type handled by
the same process group, invoking Hugin as a subprocess on the same downloaded
shots, and route to it from the enqueuer. Nothing in the queue, the schema, the
storage layout or the viewer changes. That is why the stitcher is a handler and
not a library call inside another handler.

We are not doing it now, and the reason is not effort. It is that a second
stitcher would need its own failure taxonomy, its own timeout budget and its
own answer to "which one produced this panorama", and none of that is worth
carrying before a real capture has failed.

## Filling what was never photographed

The uncovered poles are filled with the **average colour of the nearest
covered row**, stretched flat.

Extending the nearest row's actual pixels upward would look considerably
better — that is the standard trick — and it would be fabrication: smeared
detail, occupying space in a photograph of somebody's home, that a buyer could
read as real. The locked product decision is that immersive content is
reconstructed, never generated. A flat tone is the honest side of that line: it
reads as a ceiling colour and cannot be mistaken for a ceiling.

## Consequences

- `MAX_WIDTH`/`MAX_HEIGHT` in the stitcher and `MAX_PANORAMA_WIDTH`/`HEIGHT` in
  `web/src/lib/viewers/guards.ts` are the same numbers and must stay that way.
  The viewer guard is not redundant: it protects against a panorama that
  reached storage without passing through this pipeline.
- Stitching is the slowest job in the system and the one a seller waits on, so
  it reports progress per shot.
- `insufficient_coverage` is a permanent failure. The same photographs will
  never produce a complete panorama, and telling the seller to re-shoot now is
  kinder than four silent retries.
