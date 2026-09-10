# Design brief

**Status: draft for correction.** This is the input to a from-scratch redesign,
written from published research rather than from CLAUDE.md. It supersedes
nothing yet. The design contract and the B2 reference stay in force until this
brief is agreed.

## What this is, and what it is not

**Secondary research only.** Everything below is published work plus reasoning
from it. There are no conversations with Israeli agents here, no conversion
data, and no competitor analysis — CLAUDE.md §10 rules out touching Yad2 or
Madlan, and I have no access to how anyone's current listings perform.

Calling this "market research" without that qualifier would oversell it. The
questions at the end are the parts only you can answer, and three of them
change the design materially.

---

## 1. Distribution is broadcast, and it is pre-portal

The strongest finding, and it was not what I expected.

Israeli agents distribute listings through **WhatsApp Status and broadcast
lists**, and there is an established practice of "silent broadcast lists"
carrying off-market deals **before they reach the portals**. Facebook groups
and agent broadcast lists carry pre-portal listings.

Two consequences.

**The page is often the first place a property appears anywhere.** Not a
prettier version of a Yad2 listing — the thing that exists before the Yad2
listing does. That is a different product from "a nicer listing page", and it
is a much better one: it has no incumbent to displace at the moment it is used.

**The recipient is one of a list, not a chosen individual.** They have not
asked for this property. The page cannot assume the interest that a one-to-one
send would imply, which raises what the first screen has to accomplish.

Sources: [WhatsApp automation for real estate agents in Israel](https://waliner.io/whatsapp-automation-for-real-estate-agents-in-israel/),
[Buying property in Israel remotely](https://semerenkogroup.com/how-to-find-real-estate-in-israel-online-from-the-usa/)

## 2. WhatsApp Status is an image surface, not a link surface

This is the finding with the largest product implication, and the current
build has no answer to it.

Everything in this repo optimises the **link preview card** — CLAUDE.md §6
calls it "the highest-leverage code in the product". That is correct for a
link pasted into a chat. It is irrelevant to a Status post, which is consumed
as an image.

If agents post listings to Status, then the product's most-shared artefact is
**an image**, and we do not generate one. The OG card is a 1200×630 crop
intended for a scraper; a Status frame is portrait, viewed full-screen, and
read in about three seconds.

**This suggests a shareable image as a first-class output** — price, the two
or three numbers that matter, the cover photo, the agent's name, and the short
URL rendered so it can be typed. Not a screenshot of the page.

I am flagging this rather than building it: whether your agents actually use
Status is question 1 below.

Source: [WhatsApp Status for business](https://getkanal.com/blog/whatsapp-status-business-ideas)

## 3. Attention order is photo → numbers → prose

Eye-tracking on property listings finds the sections viewed first are the
photograph, then the quantitative description, and — "distantly" — the agent's
remarks. Total dwell time and fixation duration on the photograph significantly
predict a buyer's overall opinion of the home and its value.

**This validates the current structure rather than challenging it.** Hero
photograph, then the facts grid, then prose, is the order the research
supports. The B2 design already does this.

Two refinements it does argue for:

- The photograph is doing more work than any other element, which makes the
  84svh hero defensible — and makes a grey placeholder actively harmful.
- Prose is genuinely third. It should not compete with the numbers for space
  or weight.

Sources: [Eye-tracking and homebuyer attention to listing photos](https://www.virtuance.com/blog/eye-tracking-study/),
[Eye-tracking technology in online real estate rental](https://onlinelibrary.wiley.com/doi/10.1155/2021/8851657)

## 4. The engagement window is about an hour, and a click is already intent

Most engagement on a broadcast link happens within the first hour, and someone
who clicks a broadcast link is signalling buying intent.

Consequences:

- **The page is not persuading a cold audience.** It converts an already-warm
  click into a reply. Argument and salesmanship are the wrong register; getting
  out of the way is the right one.
- **Speed is conversion, not hygiene.** A page opened during a one-hour window,
  on cellular, gets one attempt.
- Nothing may require a second visit or a scroll to be understood.

Source: [WhatsApp broadcast best practices](https://www.cuedesk.com/blog/10-best-practices-for-effective-whatsapp-broadcast-messages)

## 5. Two readers, and they are not equally served

| | Agent | Buyer |
|---|---|---|
| Uses it | weekly, dozens of listings | once, for 40 seconds |
| Wants | speed of creation, their own branding, something that makes them look professional | to decide whether to reply |
| Judges it by | whether clients respond | whether it answers before it asks |

CLAUDE.md §1 says agents win when the two conflict. The research does not
contradict that, but it sharpens where they conflict: **agent branding
competes with the buyer's first screen for the most valuable space on the
page.** The current design puts a dark agent bar above the hero, which spends
the top of the first screen on the person the buyer did not open the page to
read about.

That is a real tension and question 3 below.

---

## What the research implies for the design

Stated as constraints the rebuild must satisfy, not as a layout.

1. **The first screen answers the buyer's question without scrolling.**
   For a property that is: what, where, how much, how big. The photograph plus
   four numbers.
2. **Numbers outrank prose everywhere.** They are the second thing looked at
   and the only thing compared between listings.
3. **One action.** A reply on WhatsApp. Everything else is subordinate.
4. **The photograph is the product.** Its quality determines the buyer's
   valuation of the home more than any text on the page.
5. **Loads and is legible inside the first hour, on cellular, one-handed.**
6. **The shareable artefact may be an image, not a link.** Unresolved — see
   question 1.
7. **Trust is a differentiator only where it is checkable.** The provenance
   model earns its place because a buyer can see who recorded a figure and
   when — this is the one thing the portals do not do.

---

## Questions only you can answer

These change the design. I have guesses; I would rather have your answers.

**1. Do your agents post listings to WhatsApp Status, or send links?**
If Status, the most important output is an image we do not currently make, and
that outranks everything else in this document.

**2. What do agents complain about in the listings they send today?**
The single input I could not get. Every design decision below the constraints
above depends on it.

**3. Does the agent's branding belong above the buyer's first screen?**
It is currently a dark bar above the hero. Agents pay for branding, buyers did
not open the page for it, and it costs the most valuable strip on the page.

**4. Is the buyer a first-time private buyer or an investor?**
They want different first screens — one wants rooms and neighbourhood, the
other wants price per m² and yield.

**5. Pre-portal or post-portal?**
If the wedge is circulating a property before it hits Yad2, that is a
different product with a different urgency, and possibly a "not yet listed"
state that does not exist today.

---

## What I am not proposing

**A redesign for its own sake.** The research validated the core structure —
photo, then numbers, then prose, then one action. If the rebuild ends up
structurally close to what exists, that is a finding, not a failure to try.

Where it clearly argues for change: the agent bar's position (§5), the missing
image artefact (§2), and the fact that a placeholder photograph undermines the
element the research says matters most (§3).
