# RESEARCH.md — Immersive Listing Pages

**Product research and technical architecture. Read alongside `CLAUDE.md`.**

Scope: property (apartments) and vehicles. Israeli market, Hebrew-first, mobile app.

Version 1.0 · September 2026

---

## 1. Product definition

A mobile app where a seller — private individual or small agent — captures a property or a vehicle with their phone and gets back a short, professional, shareable landing page in Hebrew.

The page carries: an immersive view (walkthrough tour for property, 360° spin for vehicles), a photo gallery, the facts buyers scan for, a description, and a WhatsApp contact button.

**The app is the creation tool. The web page is the product the buyer sees.**

### Two launch categories

| | Property | Vehicle |
|---|---|---|
| Immersive format | Linked 360° panorama tour | Image-sequence 360° spin (exterior) + panorama (interior) |
| Capture time target | 3–6 min | 2–3 min |
| Facts model | rooms, m², floor, elevator, parking, mamad, balcony, aspect | make, model, year, km, hand, gearbox, engine, test date |
| Primary channel | WhatsApp link + Yad2 cross-post (manual) | Same |

### Explicitly out of scope for v1

- CRM, lead management, contract handling
- Automated posting to Yad2 or Facebook Marketplace — **no public API exists for either; see §8**
- Auto-generated video reels — **rejected by product owner as gimmicky**
- Generative AI walkthroughs — **see §3.3, this is a legal problem not a quality one**
- Desktop or web app
- Multi-user / agency accounts

---

## 2. The key technical decision

> **For the v1 property tour, use linked 360° panoramas, NOT Gaussian Splatting.**

This is the single most important call in this document.

### Why not Gaussian Splatting for v1

3DGS is the technically impressive option and it does work from a phone. Scaniverse (free, Niantic) scans in 30–60 seconds and processes on-device in 5–10 minutes; Luma AI is free in the cloud and is widely regarded as the best consumer-grade visual quality. SuperSplat (PlayCanvas, open source, 9.4k stars) added Walk Mode and streaming LOD in March 2026, so large scenes now load acceptably on mobile.

But for v1 it fails on three counts:

1. **Unknown unit cost.** Splat training needs GPU. Luma's free tier is for personal use; commercial licensing and API access require enterprise pricing that is not published. Without that number there is no business model.
2. **High capture failure rate.** Phone capture fails on fast movement, low light, blank walls, autofocus jumps and exposure swings — which describes a typical Israeli apartment with closed shutters, white walls, and a windowless mamad.
3. **Build cost.** 3–5 months versus 4–6 weeks.

### Why linked panoramas work

This is the approach Zillow 3D Home uses. The seller stands in the middle of each room, captures a 360° panorama, and the rooms are linked by hotspots. It is dramatically simpler, it degrades gracefully, and the viewer libraries are mature and free.

**Splatting is stage 3, once there is revenue to fund GPU. Do not build it now.**

---

## 3. Technical stack for the viewers

### 3.1 Property tour — Photo Sphere Viewer

**Choice: `@photo-sphere-viewer/core` + `virtual-tour`, `markers` and `plan` plugins.**

- MIT license, TypeScript rewrite (2025), ~2.2k GitHub stars, ~8k weekly npm downloads, actively maintained
- Three.js/WebGL based; modular NPM packages so unused plugins are not shipped
- Supports equirectangular and cubemap panoramas, plus 360° video
- The `markers` plugin has the most advanced hotspot system of the open-source options, with HTML content support
- The `plan` plugin displays a floor plan with current position — a genuine upgrade over competitors

**Alternatives considered:**

| Library | Size | License | Verdict |
|---|---|---|---|
| **Photo Sphere Viewer** | ~500KB (bundles Three.js) | MIT | **Chosen** — plugin ecosystem is worth the weight |
| Pannellum | 21KB gzipped, zero deps | MIT | Smallest by far, but limited plugin ecosystem, no 360° video, and mobile browsers are not officially supported. **Fallback only if bundle size becomes critical.** |
| Marzipano | 55KB gzipped | Apache 2.0 | Google-originated, strong multi-resolution tiling, but floor plans require custom work |

**Multi-resolution note:** Pannellum and Marzipano tile large images and load only what's needed by zoom level, preventing crashes on huge panoramas. Photo Sphere Viewer has no native multires tiling — so **cap panorama resolution server-side** (recommend 6000×3000 equirectangular max, WebP).

### 3.2 Vehicle spin — image sequence, not 3D

A 360° spin is a sequence of stills; dragging advances through frames. No reconstruction involved.

**Frame count.** Industry guidance: 24 frames is the minimum for acceptable smoothness, 36 is the common average, 72 reads as perfectly smooth. Dealership platforms default to 96 frames (3.75° per frame).

> **Recommendation: 36 frames for v1.** 96 frames is a dealership standard optimized for desktop VDPs. For a consumer page loaded over Israeli cellular, 36 balances smoothness against payload. Make it configurable.

**Capture method.** The dealership workflow is the right model: the seller records a walkaround video, the backend analyzes the footage, selects evenly distributed frames around the vehicle, and returns the sequence. This avoids requiring the seller to take 36 discrete photos.

Implementation: `ffmpeg` server-side for frame extraction, with even angular distribution rather than even time distribution (people walk at uneven speed).

**Viewer: `@scaleflex/cloudimage-360-view` (CI360).** Open source, has a React wrapper, supports single-axis and two-axis grid mode, autoplay, inertia, zoom, and per-axis edge stopping. Config is straightforward:

```js
{ folder, filenameX: 'car-{index}.jpg', amountX: 36, inertia: true, zoomMax: 3 }
```

**Serve as a sprite sheet** where minimizing initial browser requests matters — 36 individual requests on cellular is slow.

**Vehicle interior:** a single equirectangular panorama from the driver's seat, rendered with the same Photo Sphere Viewer instance. One viewer library serves both categories.

### 3.3 Generative AI — hard boundary

There are two different technology families and they must not be confused:

- **Reconstruction** (panorama, photogrammetry, 3DGS) — builds from what was actually photographed. A crack in the wall appears.
- **Generation** (video models such as Higgsfield, Sora, Veo) — invents plausible continuation. It will hide a crack, invent a window, alter room proportions.

**A generated walkthrough of a real property is a tour of a property that does not exist.** Under Israeli consumer protection law that is misrepresentation. International practice is converging on mandatory disclosure for generative changes to real estate imagery.

**Rules for the codebase:**

- Never generate immersive content. Reconstruction only.
- Tonal enhancement (exposure, white balance, perspective correction, denoise) is permitted and requires no label.
- Any generative edit (virtual staging, sky replacement, object removal) requires a permanent, non-dismissible "עבר עריכה" label on the affected image.
- Generative video may be used for **marketing the app itself**, never for listing content.

---

## 4. Guided capture — this is the actual product

The viewers are free and commoditized. The libraries above cost nothing. **The defensible work is guiding an untrained seller to a usable capture.**

Impel's dealership capture app is the reference: guided step-by-step prompts keep quality high and errors low, producing an exterior 360° walkaround plus interior panorama in 5–10 minutes.

### Property capture flow

1. Select rooms to capture from a checklist (living room, kitchen, bedrooms, bathroom, balcony)
2. Per room: on-screen guidance to stand in the centre, hold the phone vertically, and rotate slowly in place
3. **Real-time quality gates** — reject and re-prompt on: too dark, too fast, focus not locked, insufficient overlap
4. After capture, prompt to link rooms: "which room does this door lead to?"
5. Upload, stitch, publish

### Vehicle capture flow

1. Prompt to park with even light, away from walls, wheels straight
2. Record a walkaround video with an on-screen progress ring showing angular coverage
3. Auto-complete when the user returns to the starting point
4. Separate prompt for interior panorama from the driver's seat

### Known failure modes to design against

Fast movement, low light, blank walls, autofocus jumps, exposure swings, and weak transitions between rooms cause more failures than the phone hardware does. Real-world captures also include uneven walking speed, reflections, background clutter and imperfect camera paths.

**Israeli-specific:** closed shutters, windowless mamad, narrow living rooms, and white plaster walls are all worst-case inputs. Test on at least 10 real Israeli apartments before locking the capture UX.

---

## 5. Page design

### What professional listing pages do

Compass, Sotheby's and most luxury listing pages use a split-panel layout — gallery on one side, details on the other, with sticky interactive elements — because buyers process photos and data simultaneously rather than sequentially.

**This does not transfer directly.** That is a desktop convention and this product is mobile-only. The transferable lessons:

1. **Photos and facts must be simultaneously accessible**, not sequential. On mobile this means facts immediately below the hero, and a sticky CTA — not a long scroll before the buyer learns the price.
2. **Commit to one philosophy.** The category splits between conversion infrastructure (Zillow, Redfin, Opendoor) and brand theatre (Sotheby's, Compass, Douglas Elliman). Sites that try both execute neither and look generic doing it. **This product is neither: it is credibility infrastructure for a seller with no brand.** The page's job is to make an ordinary seller look like they know what they're doing.
3. **Performance is a hard floor.** 69% of buyers view listings on a phone or tablet. A cinematic page that loads slowly is worse than a plain one that loads fast.
4. **Open Graph images should be WebP, not PNG** — even Compass gets this wrong. The OG image is the single highest-leverage asset in the whole product, because the page is distributed by WhatsApp link.

### Page structure (mobile, single column)

```
┌────────────────────────┐
│  hero image 4:5        │  cover photo, title + location overlay
├────────────────────────┤
│  price                 │  typographic, not a stat card
├────────────────────────┤
│  facts grid (3 cols)   │  ← buyers scan this before reading anything
├────────────────────────┤
│  IMMERSIVE VIEW        │  ← tour or spin, above the description
├────────────────────────┤
│  description           │
├────────────────────────┤
│  gallery (scroll-snap) │
├────────────────────────┤
│  map (static image)    │
├────────────────────────┤
│  seller                │
├────────────────────────┤
│  sticky WhatsApp CTA   │
└────────────────────────┘
```

**Facts grid rules:**

- Missing facts render greyed, not hidden. "No storage" is information, and the transparency is what makes the page read as honest rather than as an ad.
- Every numeric value wraps in `<bdi>` — prices, floors, m², km. See `CLAUDE.md §4.4`.

**Immersive view placement:** above the description, below the facts. It is the differentiator, but the buyer needs price and facts first to decide whether to care.

**Loading:** the immersive viewer must lazy-load behind a poster image with an explicit tap-to-enter. Never auto-load a tour on cellular.

### Design tokens

Deliberately avoid the category default of navy-and-gold — every Israeli real estate brand uses blue.

```
--plaster:  #FBFAF7   /* off-white, warm but not cream */
--ink:      #191A15
--olive:    #4A5D3A   /* single accent */
--stone:    #E4E0D6   /* dividers, image placeholders */
--muted:    #6E6F66
```

**Typography:** Frank Ruhl Libre (500/700) for headlines, prices and numeric facts — a Hebrew serif with real typographic history, which reads Israeli rather than templated. Assistant (400/600) for body and UI. Two families, clearly distinct. No italics (Hebrew has no italic form). No all-caps (Hebrew has no case).

A working reference implementation exists at `listing-page-template.html`.

---

## 6. Architecture

```
Mobile app (Expo / React Native)
  ├─ guided capture (camera, sensors, quality gates)
  ├─ upload queue (resumable, wifi-preferred)
  └─ preview + publish

Backend
  ├─ image pipeline: sharp/libvips — exposure, white balance, perspective, WebP
  ├─ panorama stitching
  ├─ video → frame extraction (ffmpeg, even angular distribution)
  ├─ sprite sheet generation for spins
  ├─ OG image generation (1200×630 WebP, <300KB)
  └─ PDF render (Puppeteer, same template as web)

Web (static)
  ├─ pre-rendered listing pages (Next.js/Astro → Cloudflare Pages)
  ├─ Photo Sphere Viewer (property tour, vehicle interior)
  ├─ CI360 (vehicle exterior spin)
  └─ short URLs: /a/{id}
```

**Static pre-render, never runtime render.** These pages must load fast on cellular and be indexable by Google.

### Data model — keep it category-generic from day one

```ts
Listing {
  id, slug, category: 'property' | 'vehicle',
  title, description, price, currency,
  facts: Array<{ key, label, value, present: boolean }>,  // category-driven
  media: {
    cover: Image,
    gallery: Image[],
    immersive?: { type: 'tour', scenes: PanoScene[], links: Link[] }
              | { type: 'spin', frames: string[], spriteUrl?, frameCount }
  },
  location?, seller, template, status, publishedAt, expiresAt
}
```

Launch with property templates only; vehicle is another fact schema plus another template. **Do not pay the generalization cost now, but do not paint into a corner either.**

---

## 7. Unit economics

Every listing carries real variable cost. This kills naive "unlimited" subscriptions.

**Photo enhancement** — market rate via API is roughly $0.30–$0.58 per image (Autoenhance.ai), or about $0.40/image at moderate volume. A 15-image listing is therefore ~$4.50, about ₪16.

**Panorama and spin processing** — mostly CPU (stitching, ffmpeg, sprite generation), so cost is hosting rather than per-image API. This is a major advantage of the panorama approach over splatting.

**Storage and bandwidth** — a tour with 8 panoramas plus a 36-frame spin is meaningfully larger than a photo gallery. Budget for it and expire pages (recommend 12 months, then archive).

**Pricing must be credit-based, measured in listings, not images.** Cap images per listing (25) to bound the exposure. A ₪99/month unlimited plan loses money on every active agent.

---

## 8. Distribution constraints — do not build around these

**Yad2** has no public posting API. Automating against their web interface violates ToS, breaks on every markup change, and gets *users* banned rather than the developer.

**Facebook Marketplace** is closed. The Marketplace Partnership Program requires Meta partner approval and is for partners syndicating inventory feeds; vehicles and property are handled through separate dealer and rental partner programs rather than the standard catalog. Meta's Content Library API includes Marketplace search but is read-only and restricted to qualified academic or nonprofit research institutions. The tools that do post are Chrome extensions performing form-fill assistance, explicitly not affiliated with Meta — a desktop browser pattern that cannot run in a mobile app.

**Therefore: the app prepares, it does not post.** Generate per-platform title and description, copy to clipboard, deep-link into the target app. The durable asset is the hosted page and its WhatsApp preview.

---

## 9. Competitive position

| Segment | Players | Why they don't serve this user |
|---|---|---|
| Consumer 3D scanners | Scaniverse (free), Luma (free), Polycam ($8–30/mo), KIRI ($10/mo) | Capture tools, not listing pages. Output a file, not a sale. |
| Real estate tour platforms | Matterport, Zillow 3D Home, CloudPano | Web-first, professional, property only |
| Vehicle 360 | Impel, Spyne (from $350/mo), Drivee, DealerSpin360, Snap360 | Dealership B2B, US market, priced far above a private seller |
| Israeli agent CRM | Nadlan CRM, שת"פ נדל"ן, Scalla | Full CRM, desktop, licensed agents only. Nadlan CRM already ships per-listing public pages, AI descriptions, QR codes and UTM analytics. |

**The gap: one private seller, one phone, one thing to sell, one good link.** Nobody serves it because a single private seller is not worth any of these companies' customer acquisition cost.

---

## 10. Open questions

1. Panorama stitching — on-device (faster, battery cost, quality variance) or server-side (consistent, latency, compute cost)?
2. Page expiry policy — hosting cost versus accumulated SEO value
3. Free-tier branding — how prominent the credit is on free listings. Direct trade-off between conversion and viral reach.
4. Vehicle facts — how much can be auto-filled from licence plate lookup, and what is legally available in Israel

---

## 11. Validation before building

In order. All cheap.

1. **Capture a real Israeli apartment as linked panoramas.** Use any existing tool. If a closed-shutter Florentin apartment does not read well as a panorama tour, the premise fails.
2. **Record a car walkaround, extract 36 frames with ffmpeg, load into CI360.** Measure how it feels on a phone.
3. **Publish both to a static page and open on cellular.** Measure time to interactive.
4. **Send the link to five people over WhatsApp.** Watch what they do first.

Test 4 is the real one. Everything in this document is downstream of whether the WhatsApp preview makes someone tap.

---

## Sources

- Photo Sphere Viewer (MIT), Pannellum (MIT, 21KB), Marzipano (Apache 2.0, 55KB) — comparison, Feb 2026
- `@scaleflex/cloudimage-360-view` — GitHub
- 360 frame count guidance: 24 minimum / 36 average / 72 smooth; 96 dealership default
- Scaniverse, Luma AI, Polycam, KIRI Engine, SuperSplat/PlayCanvas — 3DGS tooling 2026
- Impel capture app — guided dealership capture workflow
- Autoenhance.ai — photo enhancement API pricing
- Real estate site design critiques 2026 — Compass, Sotheby's, Zillow, Opendoor
- Meta Marketplace Partnerships documentation; Meta Content Library access policy
