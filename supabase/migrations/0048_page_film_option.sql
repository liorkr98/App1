-- 0048: the photo film on a listing page, only when the agent turns it on (19 Oct 2026).
--
-- Until now every page with three photos or more showed the slideshow film
-- of its photographs. The owner asked for it to be optional: off unless the
-- agent turns it on. It is one more switch in listings.extras (0047), so
-- the check that keeps extras to known keys learns one more key:
--   film  boolean  the photo slideshow film on the page
--
-- Replacing the function is enough: the constraint listings_extras_shape
-- calls it by name, and every row it accepted before it still accepts.
--
-- Safe to run twice. No apostrophes in these comments: the Supabase SQL
-- editor splits on them (src/features/migrations.test.ts).

create or replace function public.listing_extras_ok(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  key text;
  iso constant text := '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$';
  open_from timestamptz;
  open_to timestamptz;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  for key in select jsonb_object_keys(p) loop
    if key in ('visit', 'calculator', 'warranty', 'film') then
      if jsonb_typeof(p -> key) <> 'boolean' then
        return false;
      end if;
    elsif key = 'openHouse' then
      if jsonb_typeof(p -> key) <> 'object'
         or (select count(*) from jsonb_object_keys(p -> key)) <> 2
         or jsonb_typeof(p -> key -> 'start') is distinct from 'string'
         or jsonb_typeof(p -> key -> 'end') is distinct from 'string'
         or (p -> key ->> 'start') !~ iso
         or (p -> key ->> 'end') !~ iso
      then
        return false;
      end if;
      open_from := (p -> key ->> 'start')::timestamptz;
      open_to := (p -> key ->> 'end')::timestamptz;
      if open_to <= open_from or open_to - open_from > interval '8 hours' then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
exception
  when others then
    return false;
end;
$$;
