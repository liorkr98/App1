# Listing page — P0 baseline audit

Phase P0 of the listing-page redesign brief. **No code was changed.** This
records what `/a/[slug]` does today, measured rather than judged, so the later
phases have a before to argue with.

Measured 23 September 2026 against the built site (`web/dist`) served over
localhost. Screenshots in `docs/screens/p0/`.

---

## What could NOT be verified here, and why it matters

The brief's verification protocol assumes a personal machine. This ran in the
Claude Code cloud container, which cannot do two of the things §11 asks for.
Both gaps are about Safari, and Israeli traffic is iPhone-heavy.

| Asked for | Status |
|---|---|
| **WebKit / Safari at three viewports** | **NOT RUN.** The container has Chromium only, and `npx playwright install webkit` fails — the Playwright CDN is blocked by the egress proxy. Every number below is Chromium. |
| Chromium at three viewports | Done — 390×844, 375×667, 360×780. |
| Chrome DevTools MCP trace + Lighthouse | Lighthouse done (see below). Run through the `lighthouse` package driving the bundled Chromium rather than through the MCP server, because MCP servers added to a session do not load into that same running session. Same engine, same numbers. |
| Context7 doc lookups | **NOT RUN.** `context7.com` returns 403 at the proxy's CONNECT. |
| `npx impeccable detect`, Hallmark audit | **NOT RUN.** Neither skill is installed in this environment. |
| axe-core | Not run directly; Lighthouse's accessibility category covers the same rules and its findings are below. |

**Nothing in this file should be read as a Safari pass.** The WebKit column of
the protocol is still open and has to happen on the Mac.

---

## 1. Performance — comfortably inside budget

Lighthouse, mobile form factor, simulated throttling, bundled Chromium.

| | property `/a/A7K2M` | vehicle `/a/V3M9Q` | §10 budget |
|---|---|---|---|
| Performance score | **98** | **99** | ≥ 90 ✅ |
| Accessibility score | 92 | 91 | 100 ❌ |
| LCP | 1.4 s | 1.9 s | < 2.5 s ✅ |
| FCP | 1.4 s | 1.4 s | — |
| CLS | **0** | **0** | < 0.05 ✅ |
| Total blocking time | 0 ms | 0 ms | — |
| Total weight | 124 KiB | 164 KiB | < 900 KB ✅ |

Two honest caveats. The throttling is Lighthouse's **simulated** Slow-4G, not a
real throttled connection to a deployed host, so treat these as directional
until the same run happens against the Cloudflare origin. And Lighthouse did
not attribute an LCP element on either page, so "which element is the LCP" is
still unanswered — worth re-running with a real trace.

**Performance is not this page's problem.** The JS budget is not at risk
either: the page ships no JavaScript today, so the whole 12 KB the brief
allows for the lightbox is unspent.

---

## 2. Accessibility — three real defects

Lighthouse fails `color-contrast` on **both** pages. Measuring each pair
myself found what it is complaining about.

### 2.1 A confirmed absence is effectively invisible — 1.70:1

The worst finding, and the one with doctrine behind it as well as law.

`.fact.off` — the cell that renders **אין** for a fact the seller confirmed is
absent — sets `--muted` on `--stone-warm` and then applies `opacity: .42`.

| | ratio |
|---|---|
| `--muted` on `--stone-warm`, before opacity | 4.35:1 (already under the 4.5 bar) |
| **as actually rendered, at `opacity: .42`** | **1.70:1** |

The rendered colour is `rgb(186, 184, 175)` on `rgb(241, 237, 227)`. That is
not a dim label, it is a label most people cannot read, and every listing with
a confirmed-absent fact has one.

It matters more than a contrast number usually would. CLAUDE.md §7 and PRD §2
both say the distinction between "the seller confirmed there is none"
(`present: false`) and "nobody answered" (`value: null`) is the reason the page
reads as a description rather than an advertisement — and the product keeps
that promise by rendering אין at 1.70:1, which is close to not rendering it at
all. The brief anticipated exactly this: §5.1 says the absent state must use a
solid `--absent` colour measuring ≥ 4.5:1, **never opacity**.

### 2.2 Hero place line over a bright photograph — 2.46:1 on the vehicle page

Measured properly, by hiding the text, screenshotting its exact box and taking
the lightest pixel actually underneath it — a token-level check cannot see
this, because the backdrop is a gradient composited over a photograph.

| page | element | size | bar | worst case | verdict |
|---|---|---|---|---|---|
| property | `.hero-place` | 14.7px | 4.5 | 4.55:1 | pass, barely |
| property | `.hero-title` | 44.9px | 3 | 5.93:1 | pass |
| vehicle | `.hero-place` | 14.7px | 4.5 | **2.46:1** | **fail** |
| vehicle | `.hero-title` | 44.9px | 3 | 5.36:1 | pass |

The vehicle cover has a bright sky; the veil gradient is tuned for the darker
property photo. The property page passing at 4.55:1 is not reassurance either
— that is one photograph's luck, and the agent chooses the photograph.

### 2.3 `.h2-num` on the tinted block — 2.69:1

`h2 .h2-num` uses `--olive-lift`, which is a colour for type on a **dark**
ground. On `.flaws` (`--stone-warm`) it measures 2.69:1 against a 3.0 bar for
display type.

### 2.4 No `<main>` landmark

Neither built page contains a `<main>` element (`grep -c "<main"` returns 0 on
both). Lighthouse flags `landmark-one-main`. A screen-reader user has no way to
skip the agent bar and hero to the content.

---

## 3. The §4 first-screen contract

Measured at rest, no scrolling, on all three viewports.

| | property | vehicle |
|---|---|---|
| Hero photograph | ✅ all three | ✅ all three |
| Title + location | ✅ all three | ✅ all three |
| Price | ✅ all three | ✅ all three |
| **Up to 3 highlight chips** | ❌ **absent** | ❌ **absent** |
| WhatsApp action in thumb reach | ✅ (fixed dock) | ✅ (fixed dock) |

Four of five hold on every viewport, including the 375×667 small iPhone, which
is the one that usually breaks. **Highlight chips do not exist in the product
at all** — not below the fold, not anywhere. They are a P3 build, not a fix.

---

## 4. Structure

Landmark order on the property page today:

```
div.progress · div.agent-bar · header.hero · div.price-bar · div.facts
section (על הדירה) · div.gallery · section.enrich · section.map
section.seller · div.cta-dock · footer
```

Against the brief's §5 anatomy, what is missing is: the status ribbon, the
highlight chips, the monthly-cost line, the photo tour (room chips, carousel,
lightbox, floor plan), the sticky compact bar, and the agent card as a distinct
block with licence and call action. What exists and is already right is the
section order and the enrichment block's position below the seller's own
content.

Section padding is uniform (`2.4rem var(--gut)`) on every section, which §8
names as one of the reasons the page reads flat.

---

## 5. What I would fix first, and it is not the redesign

Ranked by harm per unit of work, all three are small:

1. **`.fact.off` at 1.70:1.** Replace the opacity with a solid `--absent`
   token that measures ≥ 4.5:1, and assert the ratio in a test the way
   `accents.test.ts` does. This is a legal requirement (IS 5568 / WCAG AA), a
   doctrine requirement, and about an hour.
2. **`.h2-num` at 2.69:1.** It is using a dark-ground colour on a light ground;
   `--olive` is the right token and already measures 6.9:1 there.
3. **`<main>`.** One element.

The hero-over-photograph failure (2.46:1) is a real defect but a larger fix,
because the honest answer is a veil that adapts to the photograph rather than a
darker constant — and that belongs with the P3 hero work.

---

## 6. Evidence

- `docs/screens/p0/{property,vehicle}-{iphone14,iphone-se,android}-firstscreen.jpg`
  — the first screen at rest, which is what §4 is about.
- `docs/screens/p0/{property,vehicle}-{iphone14,iphone-se,android}-full.jpg`
  — the whole page.

JPEG rather than PNG deliberately: the retina PNGs came to 9.4 MB for six
images, and this repository converts its own sample photography to WebP to save
a tenth of that (`docs/SAMPLE-IMAGES.md`).
