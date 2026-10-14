-- 0044 — The listing page in English, Russian and Arabic (14 Oct 2026).
--
-- An agent writes the listing in Hebrew; from the dashboard they can send it
-- in English, Russian or Arabic. The title and description are translated
-- by AI, the agent reads and edits them, and saves them here:
--
--   { "en": { "title": "...", "description": "...", "source": "<hash>" } }
--
-- `source` is a hash of the Hebrew they were made from, so the dashboard can
-- say when the Hebrew changed. Only a language saved here has a page at
-- /a/{slug}/{lang}/. Everything else on that page comes from our own copy.
--
-- The agent writes their own row through the existing update policy, like
-- every other listing column. The checks keep the shape and size sane: three
-- languages at most, two short texts each.
--
-- Safe to run twice.

alter table public.listings
  add column if not exists translations jsonb not null default '{}'::jsonb;

comment on column public.listings.translations is
  'The page in en/ru/ar: {lang: {title, description, source}} (0044). Written by the agent from /mine.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'listings_translations_shape') then
    alter table public.listings
      add constraint listings_translations_shape check (
        jsonb_typeof(translations) = 'object'
        and not (translations - array['en', 'ru', 'ar'] <> '{}'::jsonb)
        and pg_column_size(translations) < 60000
      );
  end if;
end $$;
