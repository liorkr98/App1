# PRD — Immersive Listing Pages

Derived from `RESEARCH.md`. Read alongside `CLAUDE.md`.

Scope here is only what `RESEARCH.md` establishes. Nothing has been added.

---

## 1. Product definition

A mobile app where a seller — private individual or small agent — captures a property or a vehicle with their phone and gets back a short, professional, shareable landing page in Hebrew.

The page carries: an immersive view (walkthrough tour for property, 360° spin for vehicles), a photo gallery, the facts buyers scan for, a description, and a WhatsApp contact button.

**The app is the creation tool. The web page is the product the buyer sees.**

The gap this fills: one private seller, one phone, one thing to sell, one good link. Nobody serves it, because a single private seller is not worth the customer acquisition cost of any existing player (`RESEARCH.md` §9).

---

## 2. The two launch categories

| | Property | Vehicle |
|---|---|---|
| Immersive format | Linked 360° panorama tour | Image-sequence 360° spin (exterior) + panorama (interior) |
| Capture time target | 3–6 min | 2–3 min |
| Primary channel | WhatsApp link + Yad2 cross-post (manual) | Same |

### Fact schemas

Implemented in `src/features/listings/schemas/`. Labels are the display strings and are authoritative — they are not translation keys and must not be edited for style.

Only three fields per category are required. Everything else is optional and the form never blocks on it.

**Property** — `property.ts`

| Label | Type | Notes |
|---|---|---|
| חדרים | number | required |
| מ״ר | number | required |
| קומה | number | |
| מתוך קומות | number | |
| מעלית | boolean | |
| חניה | boolean | |
| ממ״ד | boolean | |
| מרפסת שמש | number | unit מ״ר |
| כיווני אוויר | enum | 8 options |
| מחסן | boolean | |
| מצב הנכס | enum | 4 options |
| ארנונה | number | unit ₪ לחודשיים |
| ועד בית | number | unit ₪ לחודש |
| תאריך כניסה | date | or one of מיידי / גמיש |

**Vehicle** — `vehicle.ts`

| Label | Type | Notes |
|---|---|---|
| יצרן | text | required |
| דגם | text | required |
| שנתון | number | required |
| יד | enum | 5 options |
| קילומטראז׳ | number | unit ק״מ |
| תיבת הילוכים | enum | 4 options |
| נפח מנוע | number | unit סמ״ק |
| סוג דלק | enum | 5 options |
| צבע | text | |
| טסט עד | date | |
| בעלות קודמת | enum | 6 options |
| מספר בעלים | number | |

Booleans render as יש / אין, never as a tick or a cross.

### present vs null — the distinction the page depends on

- `present: false` — the seller confirmed the feature is **absent**. The page renders it greyed, showing אין.
- `value: null` — the question was **not answered**. The page omits it and the grid reflows.

Missing facts render greyed rather than hidden because "no storage" is information. This transparency is what makes the page read as honest rather than as an ad. Do not collapse the two states.

---

## 3. Out of scope for v1

Reproduced verbatim from `RESEARCH.md` §1:

- CRM, lead management, contract handling
- Automated posting to Yad2 or Facebook Marketplace — **no public API exists for either; see §8**
- Auto-generated video reels — **rejected by product owner as gimmicky**
- Generative AI walkthroughs — **see §3.3, this is a legal problem not a quality one**
- Desktop or web app
- Multi-user / agency accounts

---

## 4. Locked decisions

| Decision | Rationale | Reversible? |
|---|---|---|
| Panorama stitching is **server-side** | Consistency across hundreds of Android models beats latency | Yes, documented |
| Property tour = **linked 360° panoramas**, not 3DGS | Unknown GPU unit cost; high failure rate in Israeli apartments; 4–6 weeks vs 3–5 months | Yes, stage 3 |
| Vehicle spin = **36-frame image sequence** | 96 is a desktop dealership default; 36 balances smoothness against Israeli cellular | Yes, configurable |
| Immersive content is **reconstructed, never generated** | Generative walkthroughs of real property are consumer misrepresentation | **No** |
| App UI is **Hebrew only** | A second LTR layout doubles QA for a nonexistent audience | Yes, i18n scaffolded |
| **The page ships before capture** | Panoramas can be shot manually today; validate the output before building capture UX | No |

### On server-side stitching

Reversible, and here is the trade so a future reader does not have to re-derive it: on-device stitching is faster for the user and cheaper for us, but produces inconsistent quality across Android hardware. Consistency matters more when the entire product is judged on a first impression — a single bad seam in the first tour a buyer opens costs more than the latency does.

### On generation — the one irreversible line

Two technology families, not to be confused:

- **Reconstruction** (panorama, photogrammetry, 3DGS) builds from what was actually photographed. A crack in the wall appears.
- **Generation** invents plausible continuation. It will hide a crack, invent a window, alter room proportions.

A generated walkthrough of a real property is a tour of a property that does not exist. Under Israeli consumer protection law that is misrepresentation.

Codebase rules:

- Never generate immersive content. Reconstruction only.
- Tonal enhancement (exposure, white balance, perspective correction, denoise) is permitted and needs no label.
- Any generative edit (virtual staging, sky replacement, object removal) requires a permanent, non-dismissible "עבר עריכה" label on the affected image.
- Generative video may be used for marketing the app itself, never for listing content.

---

## 5. Unit economics

Every listing carries real variable cost, which is why there is **no unlimited tier at any price**.

- **Photo enhancement** — roughly $0.30–$0.58 per image via API (Autoenhance.ai), about $0.40 at moderate volume. A 15-image listing is ~$4.50, about ₪16.
- **Panorama and spin processing** — mostly CPU (stitching, ffmpeg, sprite generation), so the cost is hosting rather than per-image API. This is a major advantage of the panorama approach over splatting.
- **Storage and bandwidth** — a tour with 8 panoramas plus a 36-frame spin is meaningfully larger than a photo gallery. Budget for it and expire pages: 12 months, then archive.

### Metering

**Metering is per LISTING, not per image.** The user thinks in listings; our cost is in images; a cap of **25 images per listing** bridges the two and bounds the exposure.

A ₪99/month unlimited plan loses money on every active agent.

---

## 6. Distribution constraint

Neither Yad2 nor Facebook Marketplace has a usable public posting API, and automating against their web interfaces gets *users* banned rather than the developer (`RESEARCH.md` §8).

**Therefore the app prepares, it does not post.** Generate per-platform title and description, copy to clipboard, deep-link into the target app. The durable asset is the hosted page and its WhatsApp preview.

---

## 7. The two hard gates

1. **After the listing page ships** — does the WhatsApp preview card make someone tap? If not, nothing downstream matters.
2. **After guided capture ships** — is first-try capture success above 70% on ten Israeli apartments that are not the developer's own? Below that is a demo, not a product.
