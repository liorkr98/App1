# Rebuilding the ad

The plan is `../brag-plan.md`. The steps, from the repo root:

```bash
npm install --no-audit --no-fund --package-lock=false --prefix web
npm run build --prefix web
(cd web/dist/client && npx http-server -p 4321 -s .) &        # the real site

cd brag-output/source
ln -sfn "$(npm root -g)" node_modules                          # global playwright
node capture-pages.mjs && node capture-editor.mjs              # → ../work/cap/
```

Then `python3 prepare-images.py` crops them into `../work/img/`. After that:

```bash
mkdir -p ../work/site && cd ../work/site
ln -sfn ../../../web/public/fonts fonts && ln -sfn ../img img && ln -sfn ../../source/compose.html index.html
npx http-server -p 4400 -s -c-1 . &
cd ../../source
node render.mjs stills 1.6 6.6 13.0 18.6 21.6                  # look before the full render
node render.mjs frames                                         # 675 frames
python3 -I music.py ../work/score.wav
./deliver.sh                                                   # → ../brag.mp4, ../brag.jpg
```

`compose.html` is the whole video. `window.render(t)` is a pure function of
time, and the scene times live in its `S` table; `music.py` repeats those
times for its cues, so a scene that moves must move in both files.
