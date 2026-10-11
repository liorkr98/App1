#!/usr/bin/env python3
"""Offline Ken Burns file from a folder of stills.

This is a tool for a machine you own. It is not a service, not a CI step,
and not what a buyer downloads. The site animates photographs it already
loaded. Run this only when you want one demo file.

The page starts every still at scale 1. The pans here begin already zoomed,
which is the offline twin of the original tool — do not copy that into the
site. --music is accepted and is never called by the product.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

STILL = 3.2
FADE = 0.8
FPS = 30
FRAMES = round(STILL * FPS)
MOTIONS = ("in", "out", "pan_right", "pan_left")
EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


def zoom(motion: str, size: str) -> str:
    n = FRAMES
    if motion == "in":
        z = f"min(1.12\\,1+0.12*on/{n})"
        x = "iw/2-(iw/zoom/2)"
    elif motion == "out":
        z = f"max(1\\,1.12-0.12*on/{n})"
        x = "iw/2-(iw/zoom/2)"
    elif motion == "pan_right":
        z = "1.12"
        x = f"(iw-iw/zoom)*on/{n}"
    else:
        z = "1.12"
        x = f"(iw-iw/zoom)*(1-on/{n})"
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
    for index, _image in enumerate(images):
        motion = MOTIONS[index % len(MOTIONS)]
        filters.append(
            f"[{index}:v]scale={big[0]}:{big[1]}:force_original_aspect_ratio=increase,"
            f"crop={big[0]}:{big[1]},{zoom(motion, size)},format=yuv420p[v{index}]"
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
    for image in images:
        command += ["-loop", "1", "-t", str(STILL), "-i", str(image)]
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
