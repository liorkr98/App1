-- Two more listing event kinds for the 2.0 dashboard.
--
--   share      the agent opened /a/{slug}/share (recorded server-side)
--   scroll_75  a buyer read down to the agent block (a beacon from the page)
--
-- src/features/analytics/events.ts is the list in code; its test reads this
-- file and fails if the two disagree. Still no user agent and no IP.

alter table public.listing_events
  drop constraint if exists listing_events_kind_check;

alter table public.listing_events
  add constraint listing_events_kind_check
  check (kind in ('view', 'wa', 'share', 'scroll_75'));

create or replace function public.record_listing_event(p_slug text, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  lid uuid;
begin
  if p_kind not in ('view', 'wa', 'share', 'scroll_75') then
    return;
  end if;

  if p_slug is null or p_slug !~ '^[0-9A-HJKMNP-TV-Z]{5}$' then
    return;
  end if;

  select l.id into lid
  from public.listings l
  where l.slug = p_slug
    and l.status in ('published', 'sold')
  limit 1;

  if lid is null then
    return;
  end if;

  insert into public.listing_events (listing_id, kind) values (lid, p_kind);
end;
$$;

comment on function public.record_listing_event(text, text) is
  'Anon-callable insert of a view, wa, share or scroll_75 event for a live listing. Silent no-op on unknown slugs.';

revoke all on function public.record_listing_event(text, text) from public;
grant execute on function public.record_listing_event(text, text) to anon, authenticated;

-- The daily rollup (0029) counted views and taps; it now carries the two new
-- kinds too, so the dashboard can show how far buyers read.
create or replace view public.listing_event_daily
with (security_invoker = true)
as
select
  e.listing_id,
  (e.created_at at time zone 'Asia/Jerusalem')::date as day,
  count(*) filter (where e.kind = 'view')::bigint as views,
  count(*) filter (where e.kind = 'wa')::bigint as wa_taps,
  count(*) filter (where e.kind = 'share')::bigint as shares,
  count(*) filter (where e.kind = 'scroll_75')::bigint as read_to_agent
from public.listing_events e
group by e.listing_id, (e.created_at at time zone 'Asia/Jerusalem')::date;

grant select on public.listing_event_daily to authenticated;
