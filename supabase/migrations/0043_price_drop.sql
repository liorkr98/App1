-- 0043 — The price went down (14 Oct 2026).
--
-- When an agent lowers the price of a live listing, the page shows the old
-- price crossed out beside "המחיר ירד", and the WhatsApp card and story carry
-- the same ribbon, so the people who already saw the page have a reason to
-- open it again. The figures are the seller's own asking prices, before and
-- after: a price history, never a valuation (CLAUDE.md §7).
--
-- THE TWO COLUMNS FOLLOW THE PRICE; NOBODY WRITES THEM. listings_update_own
-- lets an agent update their own row, so a trigger keeps whatever the
-- browser sent for these columns out and sets them from the price change
-- itself:
--
--   - a published listing whose price goes down remembers the price it came
--     down from, and when. A second drop within 14 days keeps the first
--     price (the drop is measured from where it started); a drop after the
--     14 days starts a new one;
--   - a price back at or above the remembered one clears both;
--   - drafts, sold and archived listings never start a drop, and a price of
--     0 (unanswered, not free) is never part of one.
--
-- How long the page shows it (14 days) is the page's decision, in
-- src/features/listings/price-drop.ts; this keeps the facts.
--
-- Safe to run twice.

alter table public.listings
  add column if not exists price_was numeric(12, 2),
  add column if not exists price_dropped_at timestamptz;

comment on column public.listings.price_was is
  'The asking price a live listing came down from (0043). Set by listings_track_price_drop only.';
comment on column public.listings.price_dropped_at is
  'When the price came down from price_was (0043). Set by listings_track_price_drop only.';

create or replace function public.track_price_drop()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.price_was := null;
    new.price_dropped_at := null;
    return new;
  end if;

  -- Whatever was sent for these two columns does not count.
  new.price_was := old.price_was;
  new.price_dropped_at := old.price_dropped_at;

  if new.price is distinct from old.price then
    if old.status = 'published' and new.status = 'published'
      and old.price > 0 and new.price > 0 and new.price < old.price then
      if old.price_was is not null and old.price_dropped_at > now() - interval '14 days' then
        new.price_was := greatest(old.price_was, old.price);
      else
        new.price_was := old.price;
      end if;
      new.price_dropped_at := now();
    elsif old.price_was is not null and (new.price <= 0 or new.price >= old.price_was) then
      new.price_was := null;
      new.price_dropped_at := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists listings_track_price_drop on public.listings;
create trigger listings_track_price_drop
  before insert or update on public.listings
  for each row execute function public.track_price_drop();
