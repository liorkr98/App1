-- One free published listing with the היעד mark; a live grant removes it.
--
-- ============================ HUMAN REVIEW ============================
-- CLAUDE.md §8. This migration CHANGES who may publish. The previous gate
-- (0016) required a live listing_grants row. The operator asked for one free
-- published listing per user, carrying נבנה בהיעד in the footer, and for a
-- paid grant to take that mark off.
--
-- FAIL CLOSED still: a failed count is not a free listing. The editor's
-- 'unknown' still cannot publish. The trigger is the law.
--
-- Free slot = zero other published/sold listings for this owner, and no
-- live grant to consume. A second publish without a grant still raises.
-- A grant insert or update with remaining > 0 sets hyad_mark = false on
-- every listing that user already has. Owners cannot toggle the column.
-- ======================================================================

alter table public.listings
  add column if not exists hyad_mark boolean not null default true;

comment on column public.listings.hyad_mark is
  'When true, the public page carries נבנה בהיעד in the footer. Free first listing: true. A live grant turns it false.';

-- Anyone who already has remaining listings is treated as paid: mark off.
update public.listings l
set hyad_mark = false
where exists (
  select 1
  from public.listing_grants g
  where g.user_id = l.owner_id
    and g.remaining > 0
    and g.effective_from <= now()
    and (g.effective_to is null or g.effective_to > now())
);

create or replace function public.enforce_publish_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  grant_id uuid;
  already int;
begin
  if tg_op = 'INSERT' then
    new.hyad_mark := true;
    return new;
  end if;

  -- Grant path (strip_hyad_mark_on_grant) is allowed to change the mark.
  if pg_catalog.current_setting('hyad.strip_mark', true) = '1' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.status = 'published'
     and old.status is distinct from 'published' then

    select g.id into grant_id
    from public.listing_grants g
    where g.user_id = new.owner_id
      and g.remaining > 0
      and g.effective_from <= now()
      and (g.effective_to is null or g.effective_to > now())
    order by g.effective_from, g.created_at
    for update
    limit 1;

    if grant_id is not null then
      update public.listing_grants g
      set remaining = g.remaining - 1
      where g.id = grant_id;
      new.hyad_mark := false;
      return new;
    end if;

    select count(*)::int into already
    from public.listings l
    where l.owner_id = new.owner_id
      and l.status in ('published', 'sold')
      and l.id is distinct from new.id;

    if already = 0 then
      new.hyad_mark := true;
      return new;
    end if;

    raise exception 'publish requires an unexpired listing grant'
      using errcode = 'P0001';
  end if;

  -- A client save cannot take the mark off, or put it back.
  if tg_op = 'UPDATE' then
    new.hyad_mark := old.hyad_mark;
  end if;

  return new;
end;
$$;

comment on function public.enforce_publish_grant() is
  'Consumes a listing grant when status becomes published. One free first listing with hyad_mark. Raises if neither. CLAUDE.md §8.';

drop trigger if exists listings_enforce_publish_grant on public.listings;

create trigger listings_enforce_publish_grant
  before insert or update on public.listings
  for each row
  execute function public.enforce_publish_grant();

create or replace function public.strip_hyad_mark_on_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.remaining > 0 then
    perform pg_catalog.set_config('hyad.strip_mark', '1', true);
    update public.listings
    set hyad_mark = false
    where owner_id = new.user_id
      and hyad_mark = true
      and status in ('published', 'sold');
  end if;
  return new;
end;
$$;

comment on function public.strip_hyad_mark_on_grant() is
  'A paid grant removes נבנה בהיעד from every listing this user already published.';

drop trigger if exists listing_grants_strip_hyad_mark on public.listing_grants;

create trigger listing_grants_strip_hyad_mark
  after insert or update on public.listing_grants
  for each row
  execute function public.strip_hyad_mark_on_grant();
