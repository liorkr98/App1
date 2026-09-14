# Photo tour — what we ship, what we do not

Research, 14 September 2026. The request was a walkthrough: photographs
recognised by room, grouped under headlines, and a way to travel through the
apartment on the listing page, plus more templates in that spirit.

A video of a reference tour was mentioned. It did not arrive with this
session, so this is from public listing-tour patterns (room-chip walkers,
Matterport-class 3D, 360 panoramas) and from what this stack can carry
without a new vendor.

---

## What a buyer is actually doing

They open a link on a phone, in WhatsApp, often between viewings. They are
not installing a 3D player. The high-leverage move is: **name the room, then
walk the rooms in order.** That is how an agent already talks — "this is the
kitchen, this is the living room" — and it is how the photographs should be
read.

Three products in the market do a more expensive version of the same job:

| Shape | What it is | Cost to us |
|---|---|---|
| Room-chip tour | Full-bleed photo per room, chips along the bottom (LIVING / KITCHEN / …), tap to stand in that room | CSS and labelled stills. What we shipped. |
| 360 / hotspot | Panorama per room, click a door to the next | A capture session, WebP panoramas, a player. Not v1. |
| Matterport / dollhouse | Measured 3D mesh, floor plan, walk | Per-listing dollars forever, a third-party player, a different capture kit. Out. |

The room-chip tour is the one that fits a four-minute listing. An agent
already has the stills. Asking them to also shoot a Matterport is a second
product.

Auto-recognition ("this photograph is a kitchen") is a classifier on the
worker later. The field it would write is the same `room` the seller picks
today. Do not invent a second schema for it.

---

## What is in the product now

- On the photos step, a property photograph can be named: סלון, מטבח, חדר
  שינה, חדר רחצה, מרפסת, חוץ, חדר אחר. A vehicle is not offered the picker.
- The listing page, when any photograph is named, grows a **סיור בדירה**:
  room chips, then a horizontal snap strip in living → kitchen → private
  rooms order. Unlabeled photographs do not invent a tour.
- The gallery under that uses the same labels as secondary headlines.
- Empty is omitted. A listing with no rooms labelled looks as it did.

No new npm dependency. No 3D player. RTL: the first room is the rightmost
stop, because `dir="rtl"` plus a flex strip already does that.

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

Do not add blue. Do not add Matterport as a template.

---

## Recognition, later

When a classifier exists it should:

- run on the worker after upload, never at page render
- write `media.gallery[].room` (and cover) using the same union
- never overwrite a room the seller already set
- fail closed: unlabeled, not a guessed kitchen

Until then the seller's label is the identifier.
