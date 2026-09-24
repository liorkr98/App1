-- Per-day views and WhatsApp taps, for the dashboard's charts.
--
-- listing_event_counts (0017) gives one all-time total per listing. The
-- dashboard now shows a 30-day trend and a bar per day since publishing, and
-- reading raw listing_events rows into the browser to bucket them would ship
-- one row per page view. This rolls them up in Postgres instead.
--
-- security_invoker, like listing_event_counts: the view runs with the
-- caller's rights, so listing_events_select_own (0017) is what limits an
-- agent to their own listings. There is no owner filter here, on purpose —
-- the policy is the security, not the view.
--
-- Days are Israel days. A view at 01:00 on a Tuesday in Tel Aviv is
-- Tuesday's, not Monday's, which is what UTC would call it.

create or replace view public.listing_event_daily
with (security_invoker = true)
as
select
  e.listing_id,
  (e.created_at at time zone 'Asia/Jerusalem')::date as day,
  count(*) filter (where e.kind = 'view')::bigint as views,
  count(*) filter (where e.kind = 'wa')::bigint as wa_taps
from public.listing_events e
group by e.listing_id, (e.created_at at time zone 'Asia/Jerusalem')::date;

comment on view public.listing_event_daily is
  'Per-listing, per-Israel-day rollup of listing_events. security_invoker so an agent only sees their own.';

grant select on public.listing_event_daily to authenticated;
