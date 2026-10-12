#!/usr/bin/env python3
"""Offline Ken Burns file from a folder of stills.

This is a tool for a machine you own. It is not a service, not a CI step,
and not what a buyer downloads. The site animates photographs it already
loaded. Run this only when you want one demo file.

The page starts every still at scale 1. The pans here begin already zoomed,
which is the offline twin of the original tool — do not copy that into the
site. --music is accepted and is never called by the product.

Calmer since 12 Oct 2026, with the same numbers as
src/features/listings/ken-burns.ts: 4.8s a still, a 1.2s fade, 4% zoom, a
pan of about 2.5%. Each photograph is shown WHOLE, on a blurred, darkened
copy of itself that fills the frame, instead of cropped to fill it: a wide
photo in a vertical frame used to lose more than half its width.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

STILL = 4.8
FADE = 1.2
ZOOM = 0.04
PAN_ZOOM = 1.05
FPS = 30
FRAMES = round(STILL * FPS)
MOTIONS = ("in", "out", "pan_right", "pan_left")
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def zoom(motion: str, size: str) -> str:
    n = FRAMES
    if motion == "in":
        z = f"min({1 + ZOOM}\\,1+{ZOOM}*on/{n})"
        x = "iw/2-(iw/zoom/2)"
    elif motion == "out":
        z = f"max(1\\,{1 + ZOOM}-{ZOOM}*on/{n})"
        x = "iw/2-(iw/zoom/2)"
    elif motion == "pan_right":
        # Half the overhang, centred: about 2.5% of the width at 1.05.
        z = f"{PAN_ZOOM}"
        x = f"(iw-iw/zoom)*(0.25+0.5*on/{n})"
    else:
        z = f"{PAN_ZOOM}"
        x = f"(iw-iw/zoom)*(0.75-0.5*on/{n})"
    y = "ih/2-(ih/zoom/2)"
    return f"zoompan=z='{z}':x='{x}':y='{y}':d={n}:s={size}:fps={FPS}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Offline Ken Burns story file. Not a server.")
    parser.add_argument("folder", type=Path, help="Stills, in the order you want them played")
    parser.add_argument("-o", "--output", type=Path, default=Path("story.mp4"))
    parser.add_argument("--wide", action="store_true", help="1920x1080 instead of 1080x1920")
    parser.add_argument("--music", type=Path, help="A file you have the rights to. The product never passes this.")
    args = parser.parse_args()

    if shutil.which("ffmpeg") is None:
        print("ffmpeg is not on this machine. This script does not install it.", file=sys.stderr)
        return 1
    if not args.folder.is_dir():
        print(f"Not a folder: {args.folder}", file=sys.stderr)
        return 1

    images = sorted(path for path in args.folder.iterdir() if path.suffix.lower() in EXTENSIONS)[:8]
    if not images:
        print("No stills in that folder.", file=sys.stderr)
        return 1

    wide = args.wide
    size = "1920x1080" if wide else "1080x1920"
    big = (1920 * 3, 1080 * 3) if wide else (1080 * 3, 1920 * 3)
    filters: list[str] = []
    small = (big[0] // 12, big[1] // 12)
    for index, _image in enumerate(images):
        motion = MOTIONS[index % len(MOTIONS)]
        # The whole photograph over a blurred, darkened copy of itself. The
        # blur runs on a small copy and is scaled up: cheap, and softer.
        filters.append(f"[{index}:v]split=2[b{index}][f{index}]")
        filters.append(
            f"[b{index}]scale={small[0]}:{small[1]}:force_original_aspect_ratio=increase,"
            f"crop={small[0]}:{small[1]},boxblur=12:2,eq=brightness=-0.18,"
            f"scale={big[0]}:{big[1]}[bb{index}]"
        )
        filters.append(f"[f{index}]scale={big[0]}:{big[1]}:force_original_aspect_ratio=decrease[ff{index}]")
        filters.append(
            f"[bb{index}][ff{index}]overlay=(W-w)/2:(H-h)/2,{zoom(motion, size)},format=yuv420p[v{index}]"
        )

    if len(images) == 1:
        filters.append("[v0]null[out]")
    else:
        previous = "v0"
        for index in range(1, len(images)):
            target = "out" if index == len(images) - 1 else f"x{index}"
            offset = index * (STILL - FADE)
            filters.append(
                f"[{previous}][v{index}]xfade=transition=fade:duration={FADE}:offset={offset:.3f}[{target}]"
            )
            previous = target

    command = ["ffmpeg", "-y"]
    # One frame per photograph: zoompan makes `d` frames from each input
    # frame, so a looped input (as this script had) multiplied the film.
    for image in images:
        command += ["-i", str(image)]
    if args.music:
        command += ["-i", str(args.music)]
    command += ["-filter_complex", ";".join(filters), "-map", "[out]"]
    if args.music:
        command += ["-map", f"{len(images)}:a", "-shortest", "-c:a", "aac"]
    else:
        command += ["-an"]
    command += ["-c:v", "libx264", "-pix_fmt", "yuv420p", str(args.output)]

    completed = subprocess.run(command, check=False)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
