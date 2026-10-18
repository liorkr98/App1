#!/usr/bin/env bash
# Frames + score -> brag.mp4, with the poster baked in as frame 0.
# Run after: node render.mjs frames && python3 -I music.py ../work/score.wav
set -euo pipefail
cd "$(dirname "$0")/.."
POSTER_T=21.6
POSTER_FRAME=$(printf '%05d' "$(python3 -c "print(round($POSTER_T*30))")")
ffmpeg -y -loglevel error -i "work/frames/${POSTER_FRAME}.png" -q:v 2 brag.jpg
cp "work/frames/${POSTER_FRAME}.png" work/frames/00000.png
ffmpeg -y -loglevel error -framerate 30 -i work/frames/%05d.png -i work/score.wav \
  -af "loudnorm=I=-14:TP=-1.5:LRA=7" -ar 48000 \
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -profile:v high -movflags +faststart \
  -c:a aac -b:a 192k -shortest brag.mp4
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate -of compact brag.mp4
