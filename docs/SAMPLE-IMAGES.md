# Sample photographs

The eight images in `web/public/sample/` are the photographs on the two demo
listings, `/a/A7K2M` and `/a/V3M9Q`.

**Every one is CC0 or public domain.** Nothing here is licensed-with-conditions,
nothing needs attribution to be used, and nothing was generated.

## Why the licence is checked by a script and not by eye

`LicenseShortName` is read from the Wikimedia Commons API for each file, and
the fetch refuses anything that is not CC0 or public domain rather than
downloading it and sorting it out afterwards. A licence judged by looking at a
page is a licence nobody can re-verify later.

The table below is what that API returned.

| File | Licence | Author | Source |
|---|---|---|---|
| `flat-living.webp` | CC0 | Wilfredor | [Living room, Edifício Zaher, Rio de Janeiro](https://commons.wikimedia.org/wiki/File:Living_room_in_apartment_of_Condom%C3%ADnio_do_Edif%C3%ADcio_Zaher,_Le_Blond,_Rio_de_Janeiro,_Brazil.jpg) |
| `flat-lounge.webp` | CC0 | Lo | [The living room that needs houseplants](https://commons.wikimedia.org/wiki/File:The_living_room_that_needs_houseplants.jpg) |
| `flat-kitchen.webp` | CC0 | MatthewHoobin | [Kitchen, Chapel Street, Salford](https://commons.wikimedia.org/wiki/File:Hotel_room_kitchen_in_building_on_Chapel_Street,_Salford,_Greater_Manchester,_England,_on_5_October_2025.jpg) |
| `flat-balcony.webp` | CC0 | DimiTalen | [Apartment balconies, Örebro](https://commons.wikimedia.org/wiki/File:Apartment_balconies,_Kanalv%C3%A4gen_and_Floragatan,_%C3%96rebro.jpg) |
| `car-front.webp` | Public domain | OSX | [2009 Mazda3 (BL) SP25 hatchback](https://commons.wikimedia.org/wiki/File:2009_Mazda3_(BL)_SP25_hatchback_(2009-12-12).jpg) |
| `car-side.webp` | Public domain | Bull-Doser | [Mazda3 BL Sedan](https://commons.wikimedia.org/wiki/File:Mazda3_BL_Sedan_Bravo_Telecom.Jpg) |
| `car-rear.webp` | Public domain | OSX | [2009 Mazda3 (BL) Maxx hatchback](https://commons.wikimedia.org/wiki/File:2009_Mazda3_(BL)_Maxx_hatchback_(2009-12-12).jpg) |
| `car-angle.webp` | Public domain | OSX | [2009 Mazda3 (BL) SP25 hatchback](https://commons.wikimedia.org/wiki/File:2009_Mazda3_(BL)_SP25_hatchback_(2010-01-17).jpg) |

CC0 and public domain require no attribution. This table exists so the claim
can be checked, not because the licence demands it.

---

## Why they are WebP, and why that conversion happened once

Commons serves its thumbnails at roughly q90 and exposes no quality parameter,
so width is the only lever it offers. At the width the hero needs, the vehicle
cover came to **183KB** — about 3.7s on Slow 4G, against the 2.5s LCP target
in the Stage B2 brief.

Re-encoded to WebP at q72 the same image is **64KB**. So the bytes were
converted once, at build-prep time, and the results committed.

That is a build-time conversion and **not a runtime dependency**. The pages
reference files in this repository; nothing on a rendered page talks to
Commons or to any image service.

| | Property page | Vehicle page |
|---|---|---|
| photographs | 102KB | 141KB |
| largest single file | 25KB (`flat-living`) | 64KB (`car-front`) |

The largest file is the LCP element in both cases, which is what the budget
actually cares about.

---

## Why the vehicle is a 2009 and not a 2021

It used to say 2021. The public-domain Mazda 3 photographs on Commons are all
the BL generation, 2009–2013, and there is exactly one current-generation car
— a 2019 sedan — which would have put a sedan cover above a gallery of
hatchbacks from a different decade.

So the DATA was changed to match the photograph rather than the other way
round: year, hand, mileage, price, book price, the description and the
ownership history all now describe the car in the pictures.

A listing page whose stated year contradicts its own photograph is precisely
the thing this product exists to be better than. It would have been a strange
thing to ship on the demo.

---

## These are demo listings

Nothing on either page is for sale. The photographs illustrate a layout; they
are not the asset described, and no address, price or registration on either
page refers to anything real.

That is also why PRD §3's ban on generative imagery is not in play here:
none of this was generated, and none of it claims to be a property somebody
is selling.

## Replacing them

Real photographs from a real seller are better than these for judging the
design, and the fetch script that produced them is not in the repository —
it was a one-off. To swap an image, drop a WebP into `web/public/sample/` and
point the matching entry in `PHOTO` (`web/src/lib/listings.ts`) at it, with
its true width and height so the browser can reserve the box.
