#!/usr/bin/env bash
# Frames + score -> brag.mp4, with the poster baked in as frame 0.
# BT.709 matrix and tags: untagged HD is read as 709 by phones and ad
# platforms, and ffmpeg's default RGB->YUV matrix is 601, which shifts greens.
# Run after: node render.mjs frames && python3 -I music.py ../work/score.wav
set -euo pipefail
cd "$(dirname "$0")/.."
POSTER_T=21.6
POSTER_FRAME=$(printf '%05d' "$(python3 -c "print(round($POSTER_T*30))")")
ffmpeg -y -loglevel error -i "work/frames/${POSTER_FRAME}.png" -q:v 2 brag.jpg
cp "work/frames/${POSTER_FRAME}.png" work/frames/00000.png
ffmpeg -y -loglevel error -framerate 30 -i work/frames/%05d.png -i work/score.wav \
  -af "loudnorm=I=-14:TP=-1.5:LRA=7" -ar 48000 \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:v libx264 -preset slow -crf 18 -profile:v high -level:v 4.1 -g 60 -movflags +faststart \
  -c:a aac -b:a 192k -shortest brag.mp4
ffprobe -v error -show_entries format=duration:stream=codec_name,width,height,r_frame_rate,color_space,level -of compact brag.mp4
