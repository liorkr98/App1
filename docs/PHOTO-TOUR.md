# Photo tour — what we ship, what we do not

Research, 14 September 2026. The request was a walkthrough: photographs
recognised by room, grouped under headlines, and a way to travel through the
apartment on the listing page.

A reference video arrived in a later session
(`original-ad8f57f6e241dd7e4149bf2f15ed65c5.mp4`). A second file
(`38279cf1a80d3f347d4e7ac1259fd18d.mp4`) was named and not uploaded; until
it is, there is no 3D tab.

---

## What the first video actually is

It is an **AdvLife** (LTR, English) marketplace concept, not Matterport.

**Listing-detail half (the first and last seconds) — this is the reference
for the walk:**

- a vertical **filmstrip** of thumbs on the start edge
- one **large photograph**
- **Photos** as the active mode, **3D view** inactive beside it
- **Show all photos** and **Next photo**
- a side panel of title, room amenity cards, agent, map, price

**The middle of the clip is a Compare flow** (wishlists, pick listings, a
comparison table). That is a marketplace. This product is a WhatsApp listing
page. Do not port Compare, do not port `$526/night`, do not port purple or
blue, do not treat the LTR desktop split as the phone layout.

---

## What a buyer is actually doing

They open a link on a phone, in WhatsApp, often between viewings. They are
not installing a 3D player. The high-leverage move is: **name the room, then
walk the photographs in room order.**

Three products in the market do a more expensive version of the same job:

| Shape | What it is | Cost to us |
|---|---|---|
| Filmstrip + large still | Thumbs on the start edge, one big frame, next / show-all. CSS `:target`. | What we shipped. |
| 360 / hotspot | Panorama per room, click a door to the next | A capture session, WebP panoramas, a player. Not v1. |
| Matterport / dollhouse | Measured 3D mesh, floor plan, walk | Per-listing dollars forever, a third-party player, a different capture kit. Out until the second video says otherwise, and even then not by inventing a vendor. |

Auto-recognition ("this photograph is a kitchen") is a classifier on the
worker later. The field it would write is the same `room` the seller picks
today. Do not invent a second schema for it.

---

## What is in the product now

- On the photos step, a property photograph can be named: סלון, מטבח, חדר
  שינה, חדר רחצה, מרפסת, חוץ, חדר אחר. A vehicle is not offered the picker.
- The listing page, when any photograph is named, grows a **סיור בדירה**:
  room chips, a filmstrip, one large frame, **התמונה הבאה**, **כל התמונות**.
  Switching photographs is a hash (`#walk-pN`). The page has no JavaScript.
  Unlabeled photographs do not invent a tour.
- The gallery under that uses the same labels as secondary headlines, and is
  the target of כל התמונות (`#listing-gallery`).
- Empty is omitted. A listing with no rooms labelled looks as it did.

The demo fixtures (`A7K2M`, `V3M9Q`) stay unlabeled on purpose:
`verify-template-divergences.mjs` forbids a fifth `<section>` class on only
one of the two pages. The walk is data-driven, the CSS ships on both.

No new npm dependency. No 3D player. RTL: the filmstrip is grid column 1, so
it sits on the right (the start edge). **התמונה הבאה** sits `inset-inline-end`.
Keep olive and plaster. Do not add blue.

---

## Templates

The three templates (agency, editorial, dark) stay. A fourth visual template
without a reference HTML file would be a redesign, which the design contract
forbids. The walk lives **inside** the existing templates, the same way the
map and the disclosures do: data-driven, identical CSS on property and
vehicle pages, omitted when the data is not there.

A future template worth designing, if a reference is drawn:

1. **Walk-first.** Hero is the living room; the chips sit under the title;
   facts come after the tour. For listings whose photographs are the sale.
2. **Plan + rooms.** A floor-plan image with hotspots. Needs a plan the
   seller usually does not have. Do not pretend a photo collage is a plan.

Do not add blue. Do not add Matterport as a template. Do not add a Photos /
3D toggle until the second video is in hand.

---

## Recognition, later

When a classifier exists it should:

- run on the worker after upload, never at page render
- write `media.gallery[].room` (and cover) using the same union
- never overwrite a room the seller already set
- fail closed: unlabeled, not a guessed kitchen

Until then the seller's label is the identifier.
