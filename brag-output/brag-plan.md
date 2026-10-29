# עמוד מכירה (AmudSell): ad video plan

Made with the `/brag` skill (latent-spaces/brag). On this model `/brag` hands
off to `/brag-slim`: the whole video, soundtrack included, is built here from
the repo's own pages, fonts and photographs. Hyperframes is not used and no
bundled music is used.

---

## 0. The brief in one breath

**What it is:** an Israeli estate agent uploads photos of a flat from their
phone. About four minutes later they have a designed Hebrew listing page and
one link to send on WhatsApp.

**Who it's for:** Israeli licensed estate agents first (CLAUDE.md §1: when
agents and private sellers conflict, agents win). Car dealers and private
sellers come second.

**What sets it apart:** speed to a page the agent is proud to send. Photos in,
a few fields, a template, a link. It looks like an agency made it.

**Most impressive true claim:** "Photos in. A live page out." Four minutes,
from the agent's own phone, and the same listing comes in many designed
templates.

**Visual hook:** the drive-link message every agent has sent ("the photos are
in the Drive: drive.google.com/…") and the buyer's reply ("wait, where is it
exactly? Is there a photo of the kitchen?"), which is the homepage's own
before/after.

**Real UI to show:** the editor at `/new`, driven for real (category → photos
→ room tags → details → "the listing is ready, we chose a design for you").
Then the published page in real templates, and the real WhatsApp card that
`ogTitle`/`ogDescription` build.

**Tone:** `default` leaning `polished`. Punchy cuts, but the brand voice is
*checkable · plain · unhurried* (docs/PRODUCT.md). Every line is a claim the
product already makes on its own pages, nothing that promises more.

**Share caption (Hebrew, primary):** see `share-copy.txt`.

---

## 1. Format and delivery targets

| | |
|---|---|
| Primary format | **Vertical 1080×1920, 30 fps**: Reels, TikTok, WhatsApp Status, FB/IG Stories. Agents meet ads on a phone, between viewings. |
| Duration | **22.5 s** (brag sweet spot 18–22; the outro holds 3 s so the URL can be read) |
| Language | Hebrew, RTL. All on-screen copy from `locales/he.json` |
| Sound-off safe | Every beat is readable with the sound off. Music adds to it; nothing depends on audio |
| Safe zones | Nothing important in the top 220 px or bottom 340 px, where Reels/TikTok put their UI. Captions sit at y 260–520, CTA at about y 1400 |
| Deliverables | `brag.mp4` (H.264, yuv420p, AAC 192k, faststart), `brag.jpg` poster (also frame 0), `share-copy.txt` |

---

## 2. Identity (taken from the code, not invented)

| Role | Value | Source |
|---|---|---|
| Night ground (Onyx) | `#0b0c0a` | `web/src/styles/system/tokens.css` `[data-ls='onyx']` |
| Night ink | `#f2f0ea` | same |
| Night secondary | `#a7a89c` | same |
| Accent lift (line 2 of the hero) | `#86b79a` | `--ls-accent-lift` |
| Paper ground | `#f6f4ef` | `[data-ls='paper']` |
| Accent (CTA) | `#2f5340` | `--ls-accent` |
| Display face | **Noto Sans Hebrew 900, `wdth` 70** | `.hm-title`, `--ls-font-display` |
| Body / UI | **Heebo** | `--ls-font-body` |
| Numbers / wordmark | **Frank Ruhl Libre** | DESIGN.md: "numbers are the visual anchor" |
| Logo | concentric-rings mark, `web/public/wordmark.svg` | |

**Hebrew rules that apply to the video too (CLAUDE.md §5, DESIGN.md):** no
italics, no `text-transform`, no positive letter-spacing, line-height ≥ 1.5 for
body (display may be tight), gershayim `״` U+05F4 and maqaf `־` U+05BE, never
ASCII lookalikes. Never blue, because every Israeli real-estate brand is blue.
The only blue in the film is the WhatsApp link in the "old way" bubble, and it
is there on purpose.

**Numbers:** every number on screen is set as an isolated LTR run (`<bdi>`),
the same as on the site: ₪4,250,000, 108, 5 / 12, 4:00.

---

## 3. Material inventory (all real, all captured from this repo)

Built with `npm run build --prefix web`, served from `web/dist/client`, and
captured at 390×844 CSS px, DPR 3 (1170 px wide), `he-IL`, reduced motion.

| Asset | Where it came from | Used in |
|---|---|---|
| `e01…e21-*.png` | the **real editor** at `/new`, driven by Playwright (`source/capture-editor.mjs`) with the four Tel Aviv fixture photos | S3 |
| `aurora/poster/blueprint/heliograph/zine/keytag/monolith/showroom-full.png` | the **real template pages** `/templates/{id}/demo/`, demo banner hidden | S3, S4 |
| `card-aurora.png` | the **real WhatsApp card**, `/template-check/card/T4V7A-aurora/` (1200×630) | S5 |
| `tlv-living/kitchen/balcony/bath` | `web/public/fixtures/` (the homepage's own demo listing) | S2 |
| Fonts | `web/public/fonts/*.woff2` (self-hosted, OFL) | everywhere |

The demo listing: **דירת 4 חדרים ליד דיזנגוף · ₪4,250,000 · 108 מ״ר · קומה
5 / 12**. The agent "נועה כהן, כהן נכסים" is a fixture, not a real person.

---

## 4. Guardrails: what this ad must not do

Every one of these is a rule in CLAUDE.md, PRD or PRICING.md, and an ad is a
public surface:

1. **No house number and no location pin** (§7). The street is "דיזנגוף", with
   no number. The editor fill types the street only.
2. **No licence plate** (§7). This cut shows no car at all; the dealer cut
   (§11) must keep the plate field redacted, as the page renders it.
3. **No valuation language**, and no "verified" or "trusted data" pitch: the
   11 Sept pivot removed that from marketing (CLAUDE.md §1).
4. **The free tier is "2 pages, forever"** (docs/PRICING.md, `freePageLimit:
   2`). The homepage still says "the first listing is free", which is stale
   copy, so the ad uses the pricing page's line.
5. **No invented numbers, testimonials, urgency or "was" prices**
   (marketing-psychology rules in AGENT-TOOLS.md). No "200 seats left" and no
   fake agent quote.
6. **Chats are labelled "המחשה" (illustration)**, as the homepage labels its
   own WhatsApp mock (`home.waNote`).
7. **No Stripe, no portals**, and no Yad2 or Madlan logo even as a jab.
8. **Never the abstract-AI look**: no gradient meshes, glow blobs or
   "intelligence" graphics. The product is the visual.

---

## 5. Story and structure

The ad mirrors itself: **it opens on a bad WhatsApp exchange and closes on a
good one.** Between the two is the four-minute build, shown in the real
editor, and the payoff is the real page in many designs.

```
 HOOK         REVEAL          BUILD (real editor)              TEMPLATES        SEND            OUTRO
 0.0──────2.5───────────5.5──────────────────────────────12.0──────────16.5──────────19.5──────────22.5
 old way      photos in →     1 photograph · 2 fill a few ·      same listing,    one link,       wordmark
 drive link   live page out   3 design chosen · clock 0→4:00     a new film       buyer says yes  + CTA
```

Cuts land on the beat (music at 120 BPM, so 0.5 s per beat and 2 s per bar).
Every scene boundary is a multiple of 0.5 s.

---

## 6. Storyboard

Times are in seconds. Words-to-read follow the brag rule of about 0.3 s per
word, counted from the moment the whole line is on screen.

### S1 · Hook: "the old way" (0.0–2.5)

- **Ground:** paper `#f6f4ef`, with a faint WhatsApp-style tiled texture.
- **0.00:** the outgoing bubble is already on screen at frame 0 (the hook
  can't wait for an entrance): *"היי, הנה הפרטים: 4 חדרים, 108 מ״ר,
  ₪4,250,000. התמונות בדרייב:"* followed by a blue underlined
  `drive.google.com/drive/folders/1xA9mQ7…`. It slides up 20 px over 0.25 s.
  It is texture: the eye catches "Drive" and the link, which is the joke.
- **0.75:** the buyer's bubble pops in, incoming side, with a spring: **"רגע,
  איפה זה בדיוק? ויש תמונה של המטבח?"** (7 words, about 2.1 s, readable
  until 2.5). Soft "pop" sound.
- Small caption above, in Heebo 600, muted: **"הדרך הישנה"**. Small tag:
  **"המחשה"**.
- **2.25–2.5:** the whole chat drops 60 px and fades. Hard cut to night on
  the downbeat.

### S2 · Reveal: "תמונות נכנסות. עמוד חי יוצא." (2.5–5.5)

- **Ground:** Onyx `#0b0c0a` with 5% grain (the homepage hero's `ls-grain`).
- **2.50:** four real Tel Aviv photos (living room, kitchen, balcony,
  bathroom) fall in from above one at a time, 0.12 s apart, landing as a
  slightly rotated stack in the lower half, each with a soft thud.
- **2.70:** line 1 rises out of a mask, Noto Sans Hebrew 900, wdth 70,
  about 150 px: **"תמונות נכנסות."** in ink `#f2f0ea`.
- **3.20:** line 2 rises: **"עמוד חי יוצא."** in accent-lift `#86b79a`. This
  is the homepage hero, word for word.
- **4.9–5.5:** the photo stack flies into the phone (scale and move); the
  headline slides up and out. Whoosh on the cut.
- Read time: 5 words, about 1.5 s, held fully for 1.7 s.

### S3 · Build: the real editor (5.5–12.0)

A phone (rounded 64 px bezel, onyx frame, 760 px wide screen) sits
centred. Its screen shows the **real editor screenshots** in sequence, with a
fingertip "tap" ring wherever a button is pressed. A step caption sits above
the phone (Noto 900, about 92 px) and a running clock chip (Frank Ruhl Libre,
LTR) counts **0:00 → 4:00** across the scene. It is a time-lapse of the
homepage's own "four minutes" claim.

| t | Phone screen (real capture) | Caption |
|---|---|---|
| 5.5 | `e01` step 1, "מה מפרסמים?" with דירה selected (tap ring on דירה) | **1 · מצלמים** |
| 6.4 | `e02` the four photos, room-tagged, "תמונת שער" (cover) chosen by itself | sub: **"החדרים מתויגים ותמונת השער נבחרת לבד."** |
| 7.3 | `e03` "מה קונה מצפה לראות" checklist: living room ✓, kitchen ✓, bathroom ✓ | (same) |
| 8.0 | tap "הבא: הפרטים" → `e05…e10` stop-motion every 0.35 s: city, street, price ₪4,250,000, rooms 4, 108 מ״ר, floor 5 | **2 · ממלאים כמה שדות** |
| 10.2 | tap "הבא: לראות את המודעה" → `e20` **"המודעה מוכנה"**, with the real Aurora page in the preview frame | **3 · בוחרים עיצוב** |
| 11.2 | the preview scrolls a little (the real Aurora page) and the clock settles on **4:00** | sub: **"העמוד מוכן."** |

The street is typed as "דיזנגוף" only (guardrail 1).

### S4 · Templates: "אותה מודעה. כל פעם סרט אחר." (12.0–16.5)

- **Ground:** Onyx. Caption (the homepage's own section title) at the top:
  **"אותה מודעה."** / **"כל פעם סרט אחר."** (6 words, about 1.8 s, on
  screen for 4 s).
- **12.0:** the phone from S3 pulls back and two more phones slide in from
  the sides (rotated ±6°, 82% scale), making a three-phone fan.
- Each phone **scrolls a real template page** (full-page captures, scrolled
  as a function of time): left Poster (108 in giant type), centre Aurora,
  right Blueprint (floor plan).
- **13.5, 14.2, 14.9, 15.6:** the centre phone swaps template on the beat
  with a vertical wipe: Heliograph (sun dial), Zine, Keytag (the listing as
  a key tag), Monolith. All of them show the same flat. The car templates are
  left for the dealer cut (§11). The template's Hebrew
  name sits under the centre phone in a pill (`editor.templates.{id}`).
- A soft tick sound on each swap, quantised to the beat.

### S5 · Send: one link (16.5–19.5)

- **Ground:** paper again, the same chat look as S1. This is the mirror.
- Caption: **"שולחים קישור אחד."** (story4).
- **16.6:** the outgoing bubble arrives carrying **the real OG card**: cover
  photo, "דירת 4 חדרים ליד דיזנגוף", ₪4,250,000, 4 rooms · 108 m² · 5/12,
  "נועה כהן · כהן נכסים" and the domain `amudsell.com`. "Sent" pop.
- **17.6:** the buyer's reply pops: **"וואו. אפשר לבוא לראות מחר?"**
  (`home.waBack`, 5 words). It holds until 19.5.
- Tag: **"המחשה"**.

### S6 · Outro and CTA (19.5–22.5)

- **Ground:** Onyx with grain.
- **19.5:** the logo mark draws its rings (3 strokes, 0.4 s) and the wordmark
  **"עמוד מכירה"** (Frank Ruhl Libre 700, about 150 px) rises.
- **19.9:** tagline **"המודעה שלך, מוכנה לשליחה"** (`home.tagline`).
- **20.3:** CTA pill in accent `#2f5340` with paper text: **"לבנות מודעה"**
  (`home.cta`). One light sheen pass.
- **20.6:** **"2 דפים חינם, לתמיד."** (pricing.sub, guardrail 4) and
  `amudsell.com` in Heebo, LTR.
- Hold to 22.5. The music resolves on the tonic at 21.5 and its tail rings
  out.

---

## 7. Motion language

- Ease: `cubic-bezier(.16,1,.3,1)` (`--ls-ease-expo`) for arrivals, and
  `(.65,0,.35,1)` (`--ls-ease-io`) for moves. Spring overshoot
  (`--ls-spring`) only on chat bubbles.
- One authored entrance per scene and staggers of 2–3 steps, the same rule as
  DESIGN.md "Motion".
- Mask reveals for display type (a line rises out of its own clip), never a
  blanket fade-and-rise.
- No crossfade between two busy layouts. Scene changes are hard cuts on the
  beat, or an old-out then new-in stagger through the ground colour.
- The phone has a soft shadow and nothing glassy. DESIGN.md bans glass and
  decorative blur.

---

## 8. Sound design (original, synthesised; no licence questions)

The `/brag` repo's bundled ende.app tracks carry no verified licence ("verify
the exact licence before publishing"), and this is a paid ad. So the score is
**written and synthesised from scratch** (`source/music.py`, NumPy only).

- **Tempo 120 BPM, key of F major.** Progression **Fmaj7 → Am7 → Dm7 →
  B♭maj7**, one chord per bar (2 s).
- **S1 (0–2.5):** "the old way". A muffled, low-passed plucked Fmaj7 with no
  drums. It sounds slightly stuck.
- **2.5, the drop:** kick on every beat, a soft clap on 2 and 4, closed hats
  on the 8ths, a round sine-saw bass on chord roots, and a bright pluck
  arpeggio.
- **S4:** the hats open up and the pluck goes up an octave. This is the lift.
- **S5:** the drums thin out to kick and clap so the "pop" sounds speak.
- **S6:** the full band hits once at 19.5, then a sustained Fmaj9 pad
  resolves on F with a 1 s tail into 22.5.
- **SFX, all pitched to the key:** soft taps (filtered click and an F6
  blip), the message "pop" (C6 → F6 sine chirp), photo thuds (low sine
  thump), template-swap ticks, and a filtered-noise whoosh on the S2→S3 and
  S3→S4 cuts. All sit about 9–12 dB under the music, and repeated ticks sit
  lower still.
- **Mix:** the music bus is soft-clipped and normalised to about −14 LUFS
  (social-platform loudness), with a 20 ms fade-in and fade-out.

---

## 9. Build pipeline

1. `npm install --prefix web` and `npm run build --prefix web`, then serve
   `web/dist/client` on :4321.
2. `source/capture-editor.mjs` and `source/capture-pages.mjs` (Playwright)
   write the real screens to `work/cap/`.
3. `source/compose.html` contains all six scenes as one 1080×1920 stage.
   `window.render(t)` is a **pure function of time**: no CSS animations, no
   timers. Fonts are awaited before the first frame.
4. `source/render.mjs` steps t = i/30 for 675 frames, screenshots each one to
   `work/frames/`, and checks stills of every scene and every mid-transition
   before the full encode.
5. `source/music.py` writes `work/score.wav`, the music and SFX already mixed.
6. ffmpeg: frames + score → `brag.mp4` (H.264 CRF 18, yuv420p, faststart).
   The poster frame (S6, settled, about t = 21.6) goes to `brag.jpg` and
   replaces frame 0, so the duration and sync are unchanged.

---

## 10. QA checklist before calling it done

- [ ] Stills from every scene and from each transition midpoint: no overflow,
      no collisions, contrast is readable.
- [ ] Hebrew: `״` U+05F4 in מ״ר, maqaf in תל אביב־יפו, no italics, no tracking.
- [ ] Numbers run LTR inside RTL lines (₪4,250,000 is not reversed).
- [ ] No house number, no plate digits, no pin (frame-by-frame check of
      S3/S4).
- [ ] The free claim reads "2 דפים חינם, לתמיד." and nowhere "first listing".
- [ ] Duration 22.5 s ± 1 frame; the audio length matches the video length.
- [ ] Frame 0 is the poster.

---

## 11. Variants worth making next (not in this render)

- **Square 1080×1080** cut for the feed, with the same scenes reflowed.
- **Car-dealer cut:** the plate lookup ("type the plate, the rest fills
  itself") with the Showroom and Keytag templates. It needs a fictional plate
  that is visibly not real, or a masked field.
- **6-second bumper:** the S2 headline straight into S4's fan, then the logo.
- **English subtitle track** (`en.json` has empty values today, so this needs
  copy first).

---

## 12. Before the ad goes live (29 Oct 2026)

Done in this pass:

- [x] Re-captured from `main` (30 commits newer than the first render): the
      editor now shows "עוד N שלבים עד הקישור", and the ad matches it.
- [x] The licence badge ("מאומת · פנקס המתווכים") and licence number are no
      longer shown. The fixture agent is fictional, and the register check is
      not switched on in production (OWNER-ACTIONS.md), so the ad must not
      show a badge no real agent can get today.
- [x] Encoded with the BT.709 matrix and tags. The first export was untagged
      with a BT.601 matrix, which shifts greens on phones and ad platforms.
- [x] The homepage free-tier copy now matches the ad ("2 דפים חינם, לתמיד").

Only a person can do these:

- [ ] **Listen to it** on a phone speaker and on headphones. The score was
      checked by measurement only (−14 LUFS, band balance), never by ear.
- [ ] **Open amudsell.com on a phone** and follow the ad's path: homepage →
      "לבנות מודעה" → upload four photos → publish → send the link to
      yourself on WhatsApp. The card must look like the one in S5. This
      session could not reach the live site.
- [ ] **The landing link** for each platform. The site's counter keeps only
      `utm_source` (lowercase letters, digits, `.` and `-`, up to 40), so
      put the platform and the ad in it: `https://amudsell.com/?utm_source=meta-reel-1`,
      `?utm_source=tiktok-1`, `?utm_source=wa-status`. Then check that
      `/admin/data/` counts the visit (needs migration 0042).
- [ ] **Photo licences.** `docs/CREDITS.md` lists the four Tel Aviv photos
      as "Unsplash / Pexels" without recorded authors or URLs. Both licences
      allow use in ads, but in a paid ad the source of each file should be
      re-confirmed and written down. Otherwise swap in your own photos.
- [ ] **The listing is a demo.** A stock flat with a price can be read as a
      real listing. The chats are already tagged "המחשה"; decide whether the
      listing scenes need a small "דוגמה" tag as well.
- [ ] **Ad platform category.** Meta may route anything mentioning
      apartments and prices into its Housing special ad category, which
      limits targeting. The ad sells software to agents, not housing, so
      declare it as such and keep the targeting to professionals.
- [ ] **Payments.** The PSP is still undecided and the adapter is disabled
      (CLAUDE.md §8). The ad promises only the free tier, which works today.
      An agent who hits the third page cannot pay yet, so plans are granted by
      hand with `admin_grant_plan()`.
- [ ] **4:5 feed version.** Facebook and Instagram feeds crop 9:16 to 4:5,
      which cuts the captions at the top. Use the 9:16 video only for
      Reels, Stories, TikTok and WhatsApp Status until a 4:5 cut exists.
