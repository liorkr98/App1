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
- [ ] **"המחיר ירד": migration 0043.** Supabase → SQL editor → open
  `supabase/migrations/0043_price_drop.sql` on GitHub, press **Raw**, copy
  all of it, paste into a NEW empty tab → Run. Safe to run twice. Until it
  runs nothing breaks: pages read the listing without the price history and
  the dashboard's "הורדתי מחיר" saves the price without the crossed-out one.
- [ ] **The page in English, Russian and Arabic: migration 0044.** Same way:
  `supabase/migrations/0044_listing_translations.sql` → **Raw** → copy all →
  a NEW empty tab → Run. Safe to run twice. Until it runs, saving a translation
  on the dashboard says 0044 is missing, and nothing else changes. The
  translation uses the `DEEPSEEK_API_KEY` the Worker already has.
- [ ] **Page options and the sold page: migration 0047.** Same way:
  `supabase/migrations/0047_page_options_sold_page.sql` → **Raw** → copy all →
  a NEW empty tab → Run. Safe to run twice. It adds what the agent turns on
  for one page (the visit button, the calculator, an open house, a warranty)
  and lets a sold page stay up when the agent chooses. Until it runs nothing
  breaks: the editor says the options will be saved after the update, and
  marking a listing sold takes the page down as before.
- [ ] **The photo film switch: migration 0048.** Same way:
  `supabase/migrations/0048_page_film_option.sql` → **Raw** → copy all → a NEW
  empty tab → Run. Safe to run twice. From this change the photo slideshow
  film shows on a page only when the agent ticks "סרטון מהתמונות בעמוד";
  until 0048 runs, ticking it says it will be saved after the update.
- [ ] **Read the Russian and Arabic copy** when you can: `locales/ru.json`,
  `locales/ar.json` and `locales/strings/` were written without a native
  reviewer (you chose to ship as is). The listing text itself is the
  agent's: the AI drafts it and they edit it before saving.
- [ ] **The site's address for the build.** Cloudflare → Workers → besivov →
  Settings → Build → Variables: `SITE_URL` must be exactly
  `https://amudsell.com` (or deleted: that is the default). Search Console
  refused all 40 sitemap entries on 14 Oct because they named another host;
  the sitemap now always uses the address it was asked on, but the page
  canonicals and the WhatsApp card links still come from this variable.
  Then retry the deployment, and in Search Console resubmit
  `https://amudsell.com/sitemap.xml`.
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
- [ ] **"המשך עם Google" on `/enter/`.** Needs Supabase → Authentication →
  Providers → Google switched on with the Client ID and Secret from the
  Google Cloud project's Web client (redirect URI: the Supabase callback
  shown on that screen), and the Google app published (Branding: home page
  `https://amudsell.com`, privacy `/legal/privacy/`, terms `/legal/terms/`).
  Done 14 Oct. Without it, the button returns with "הכניסה לא הושלמה".

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
- [ ] **What to build next.** Offered, not started: a "price updated" card to
  re-share; pages in English, Russian and Arabic. Built 18 Oct 2026: the
  square and 4:5 feed versions of the video, and music for it (three moods,
  generated in the agent's browser, so no track to licence). Not yet heard on
  a real iPhone or Android: make one at `/lab/film/?format=square&music=calm`
  and send it to yourself on WhatsApp.
