# What only the owner can do (13 Oct 2026)

Things that are built and waiting on a person: a setting, a click in a
dashboard, a decision. Each says what to do and where. Tick it off here when
done, so the next session knows.

## Switch on

- [ ] **Agent pages and true view counts: migration 0041.** Supabase → SQL
  editor → paste `supabase/migrations/0041_agent_pages.sql` → Run, BEFORE
  merging the PR that adds it. It is safe to run twice. Without it the
  agent page section in /me cannot turn a page on, and /agent/... answers
  "not found"; nothing else breaks. The new view counting needs no database
  change.
- [ ] **The data page: migration 0042.** Supabase → SQL editor → paste
  `supabase/migrations/0042_site_analytics.sql` → Run, BEFORE merging the PR
  that adds it. Safe to run twice. Then open `/admin/data/` signed in as
  yourself (your account is already in `site_admins` if `/admin` opens).
  Site visits start counting from the deploy; listing views, sign-ups,
  pages and the editor funnel show their history at once. The "ניתוח AI"
  button uses the `DEEPSEEK_API_KEY` the Worker already has.
- [ ] **Billing's daily job.** Supabase → Database → Extensions → enable
  `pg_cron`, then in the SQL editor:
  `select cron.schedule('billing-daily', '17 3 * * *', 'select public.run_billing_daily()');`
  It sends the 30-day lock notice, moves a finished launch price to the
  regular one and downgrades lapsed accounts. Publishing does not depend on
  it. Details: `docs/PRICING-OPS.md`.
- [ ] **The broker-licence check.** Cloudflare → Workers → besivov →
  Settings → Variables: add `BROKER_REGISTER_RESOURCE_ID` (plain text), the
  data.gov.il resource id of the Justice Ministry broker register
  (פנקס המתווכים). Until then every check answers "could not check", agent and
  office plans stay closed to new sign-ups, and the agents page does not
  mention the licence badge.
- [ ] **Search Console.** Add `https://amudsell.com` as a property, verify it,
  and submit `https://amudsell.com/sitemap.xml`. The sitemap already lists
  the template pages, the agent, dealer and private-seller pages and the
  guides.

## Check

- [ ] **The story video on real phones.** Open `https://amudsell.com/lab/film/`
  on an iPhone and on an Android phone, press "להכין סרטון", watch it, save it
  and send it to yourself on WhatsApp. The page shows the format it made:
  `video/mp4;codecs=avc1…` is right; `video/webm` means that browser cannot
  record H.264 and an iPhone may not play the file.
- [ ] **The new pages on the live site:** `/templates/`, `/agents/`,
  `/dealers/`, `/private/`, `/guide/`, and one example under
  `/templates/{name}/demo/`. On an example, the WhatsApp and call buttons
  should lead to the note at the top, never to a phone.

## Decide

- [ ] **The copy.** Every Hebrew sentence on those pages was written for you
  to review: `templates.*`, `audiences.*` and `guides.*` in
  `locales/he.json`.
- [ ] **A named author for the guides**, when there is one. Today the guides
  are signed "צוות עמוד מכירה". A person (name and role) is a one-line change
  in `src/features/guides/guides.ts`.
- [ ] **What to build next.** Offered, not started: a square or 4:5 feed
  version of the video; a "price updated" card to re-share; pages in English,
  Russian and Arabic; royalty-free music for the video.
