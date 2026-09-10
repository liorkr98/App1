# Where this product gets better

Research, 10 September 2026. Secondary sources only — published material and
reasoning from it. There are still no conversations with Israeli agents here
and no conversion data, so the caveat at the top of `DESIGN-BRIEF.md` applies
unchanged: the questions this cannot answer are marked as questions.

Ordered by what it would change, not by effort.

---

## 1. The profession was regulated last year, and the regulations describe this product

**This is the finding that reframes everything else.**

The **Real Estate Brokers Regulations (Ethics and Professional Duties), 2024**
came into force on **9 March 2025**. For the first time, every licensed broker
in Israel carries binding ethical and professional obligations, enforced by the
Registrar of Real Estate Brokers at the Ministry of Justice, who takes
complaints under the Real Estate Brokers Law 1996.

Read the obligations next to this repo's schema and it is uncomfortable how
closely they line up. The regulations require a broker to present a property
dossier containing:

> official written property documentation identifying the property, ownership
> details, property size, the number of rooms

plus balconies, parking, storage, floor level and lift access; the expected
vacancy date; whether the structure has been declared unsafe; the asking price;
and for rentals the compulsory extras — ארנונה, ועד בית — with approximate sums.

`src/features/listings/schemas/property.ts` already carries rooms, area, floor,
total floors, lift, parking, ממ״ד, balcony, storage, condition, ארנונה and ועד
בית. **The schema was designed for a good listing page and it accidentally
became a compliance form.**

### Positioning

CLAUDE.md §1 says the moat is the data. That is still true, but the *wedge* is
now sharper than "a nicer page". Every one of the 22,995 licensed brokers
acquired a set of legal duties in March 2025 that most of them are meeting on
paper or not at all. A tool that produces a compliant advertisement as a side
effect of producing a good one is a much easier thing to sell than a prettier
Yad2.

**Do not put a compliance claim on the site before a lawyer reads the actual
regulation.** Everything above comes from law-firm client updates, not from the
Hebrew text of the regulations. "Helps you meet the disclosure duties" is a
legal claim about someone else's licence, and the product's whole voice is
about not overstating. Get it checked, then say it plainly.

### The concrete gaps, in order

**a. The licence number must appear on the advertisement, and we hide it.**

> Any property advertising must now clearly include the agent's name, status as
> a licensed broker, and license number.

I built `licence_number` into the profile this session and deliberately kept it
off the page, on the grounds that showing an unverified number beside
register-verified facts borrows the facts grid's credibility. **That reasoning
was right about credibility and wrong about the requirement.** The agent is
legally obliged to display it; it is not a badge we are awarding.

The fix keeps both: show it in the seller block as a plain, unstyled detail —
`רישיון מס׳ 1234` — with none of the `מאומת` treatment, and never in the agent
bar where it would read as endorsement. It is the agent's declaration, rendered
as the agent's declaration. `toSeller` currently strips it and has a test
asserting so; both change together, and the test becomes "renders as
self-declared, never as verified".

**b. A listing that is no longer available must be updated or removed.**

> If a property is unavailable, the broker must remove or update the listing
> immediately.

This is also the loudest existing complaint about Israeli listings — agents
advertising sold properties to generate leads is the bait-and-switch the
regulations were written to stop.

`listings.status` supports `sold` and `archived`, and `expires_at` exists. **No
UI writes either.** This is the cheapest high-value feature in the repo: a
one-tap "נמכר" on `/mine`, the page rendering a sold state instead of a live
one, and a nudge after N weeks asking whether it is still available. It is a
day of work against a legal duty and a reputational complaint at once.

**c. The seller disclosure form exists for vehicles and not for property.**

The regulations require owner disclosure covering defects, infrastructure
problems, non-conforming construction, legal proceedings, usage restrictions
and environmental nuisances (noise, odour, radiation).

`Listing.disclosures` exists and DESIGN-CONTRACT §5 records "disclosures —
vehicle only" as one of the four permitted divergences. For a car it holds
scratches. **For a property it would hold exactly what the regulation asks
for.** Extending it is mostly schema work, and it turns the divergence into a
category difference in *content* rather than in *presence*.

Note the tension: PRD §2 caps required fields at three per category because a
required field the seller cannot answer is a form they abandon. Disclosures
must stay optional in the product even where they are mandatory in law — the
product's job is to make them easy and to mark their absence honestly, not to
enforce someone else's licence conditions.

**d. Written owner consent before advertising.** Nothing exists. A checkbox is
not consent; a stored, timestamped declaration naming the owner is closer. The
plate step already has exactly this shape — `attachLookup` refuses without an
ownership declaration — so the pattern is in the codebase already.

**e. Seven-year document retention.** A duty the agent carries and a reason
their listings should not be ephemeral. Probably not v1, but it argues against
ever hard-deleting a published listing.

Sources: [Barnea client update](https://barlaw.co.il/practice_areas/litigation/real-estate-litigation/client_updates/new-real-estate-brokers-regulations-in-israel-require-professionalism-transparency-fairness-and-accountability/),
[BuyItInIsrael](https://www.buyitinisrael.com/news/major-changes-in-regulations-for-real-estate-agents-in-israel-a-win-for-buyers),
[Lexology](https://www.lexology.com/library/detail.aspx?g=7dd8cea7-8a49-4fc6-b36f-e39a5f52e3d0),
[Jerusalem Post](https://www.jpost.com/business-and-innovation/real-estate/article-807021)

---

## 2. The transactions layer has a path, and it is not an API

RESEARCH.md §1 calls transaction history the headline — what sold in this
building over the last two years — and §4.2 records why v1 ships proximity
instead. The reason to revisit is that the path is clearer than "no API"
suggests.

- The **Israel Tax Authority** publishes a real estate database covering sales
  of real estate rights, queryable by category.
- **Govmap** exposes address autocomplete, block/parcel (גוש/חלקה) lookup and
  recent transactions by radius; community MCP servers and Python wrappers
  already wrap it.
- `data.gov.il` is CKAN, with Hebrew and English keyword search over thousands
  of datasets.

There is **no official transactions API**, so anything built here is a wrapper
over an interface nobody promised to keep. That is an argument for the ingest
pattern this repo already uses — a scheduled job into Postgres, with
`source_sync` recording what was fetched and when — rather than a live call on
the page. It is also an argument for treating a stale transaction table as a
first-class state: `source_sync` already has `last_error` and `last_synced_at`,
and the provenance model already knows how to say "correct as of".

The גוש/חלקה lookup is independently useful before any transaction data lands:
it is the "official written property documentation identifying the property"
the regulations ask for, and it is verifiable.

Sources: [Israel Tax Authority real estate database](https://www.gov.il/en/service/real_estate_information),
[Israel Open Data Resources](https://github.com/danielrosehill/Israel-Open-Data-Resources),
[data.gov.il MCP](https://agentskills.co.il/en/mcp/data-gov-il)

---

## 3. Payments: the undecided piece now has a shortlist

PRD §6 leaves the provider open behind an interface, and CLAUDE.md is emphatic
that it will never be Stripe — no ILS settlement for an Israeli business, no
Bit, no compliant tax invoice.

The Israeli field, by monthly turnover:

| Turnover | Best fit | Why |
|---|---|---|
| under ₪30k | **Grow (Meshulam)** | simplest onboarding, clean hosted checkout, newest API |
| ₪30k–200k | **Cardcom** or PayPlus | Cardcom has the better API and the real recurring-billing tools |
| over ₪200k | Cardcom or **Tranzila** | best rates after negotiation |

Tranzila covers cards, Bit, Apple Pay, Google Pay, instalments and recurring.
Bit matters: it is how Israelis actually pay each other.

**Recommendation: start on Grow (Meshulam), design the interface so Cardcom is
a swap.** The first hundred listings will not clear ₪30k/month, onboarding
speed is the thing that matters at that stage, and recurring billing — where
Cardcom is genuinely better — is not needed until there is a subscription.

**One deadline worth knowing:** since **January 2026** Israel's Invoice Reform
requires allocation numbers (מספרי הקצאה) for invoices over ₪10,000. Irrelevant
for a per-listing fee; relevant the moment an agency plan is sold annually.

Sources: [Israeli payment gateway comparison 2026](https://www.autoflowr.co.il/compare/payment-gateways-israel-2026),
[Tranzila vs Cardcom vs Meshulam](https://danielmashkov.com/insights/israeli-payment-gateways-comparison)

---

## 4. What the pricing model should probably be

Not researched as thoroughly as the above, and stated as an argument rather
than a finding.

Israeli brokerage commission is **2% + 18% VAT ≈ 2.36%** effective. On a ₪2M
apartment that is roughly ₪47,000 to the agent's side. Against that, a tool
that helps close costs nothing worth negotiating over.

The consequence is that **per-listing pricing fights the product's own
strategy.** CLAUDE.md §1 picks agents precisely because they come back weekly;
charging per listing taxes exactly the behaviour the product wants, and pushes
an agent to decide each time whether this property is worth it. A monthly
subscription with a free first listing matches how the tool is used and how the
value arrives.

`entitlement` is already `'paid' | 'unpaid' | 'unknown'` and fails closed,
which fits a subscription as well as it fits a purchase — no rework needed to
change the model, only to add the provider.

**The private seller is the awkward case.** They will not subscribe for one
listing every seven years. A one-off price for them and a subscription for
agents is two products; keeping the free tier genuinely useful and charging
agents for branding, volume and the library is one. The נבנה בסיבוב fallback in
the agent bar is already the free tier's shape.

Source: [Israel brokerage fees 2026](https://ronkin-list.com/real-estate-agency-fees-tel-aviv/)

---

## 5. Smaller things, worth their cost

- **`src/types/database.ts` is badly stale** — it describes only `profiles` as
  it existed in 0001, with none of `listings`, `jobs`, `listing_enrichment`, or
  any 0009 column. Nothing imports it, which is why it went unnoticed and also
  why it is cheap to fix: regenerate it with the Supabase MCP.
- **Migration 0009 is applied but not recorded.** The columns are live in
  `yaaqcfcjkfdwtczespny`, but Supabase's migrations table stops at 0008, so a
  fresh environment built from the tracked migrations would match production by
  luck rather than by record.
- **`hasivuv.com` does not resolve.** The site serves from
  `besivov.liorkr98.workers.dev`. Until the domain is attached, `SITE_URL`
  cannot be set to it and every share link carries the workers.dev host —
  which is the one URL the whole distribution model rests on (DEPLOY.md).
- **Workers Builds fails on every pull request** and will keep doing so: the
  deploy command is `npx wrangler deploy`, which targets production, but
  non-production branches default to `wrangler versions upload`. Either turn
  off non-production builds or make the command branch-aware — the second gets
  you a preview URL per PR, which is worth having.

---

## 6. What not to build

- **Not a portal.** The product's whole advantage is being pre-portal —
  RESEARCH-adjacent work in DESIGN-BRIEF §1 found agents distribute through
  WhatsApp broadcast before anything reaches Yad2. A search page competes with
  incumbents on their ground and abandons that.
- **Not scraping Yad2 or Madlan.** CLAUDE.md §10 already rules it out. The
  regulations add a second reason: republishing someone else's listing without
  the owner's written consent is now the specific thing brokers may not do.
- **Not straight-line distance, and not Google Distance Matrix.** Unchanged from
  CLAUDE.md §2, and worth restating because the temptation returns every time
  OSRM is inconvenient.

---

## The three questions that still need a human

Carried forward from `DESIGN-BRIEF.md`, because none of this answers them.

1. **What do agents complain about in the listings they send today?** Still the
   single input no amount of secondary research substitutes for. Twenty minutes
   with five agents beats every section above.
2. **Would an agent pay to be compliant?** §1 assumes the regulations are felt
   as pressure. If brokers are ignoring them and enforcement is rare, the wedge
   is theoretical.
3. **Status or links?** Answered for now — links, in chats and broadcast lists —
   which is why the homepage sells the link. Worth re-asking once real agents
   are using it, because the answer changes what the most-shared artefact is.
