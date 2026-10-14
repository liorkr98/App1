-- The page in English, Russian and Arabic (migration 0044). Runs after the
-- other test files, reusing tests.sql's helpers. Each block raises on a
-- failed expectation.

do $$
declare
  agent uuid := t.new_user('lang-agent@example.test');
  other uuid := t.new_user('lang-other@example.test');
  live uuid;
  saved jsonb := '{"en": {"title": "Four rooms", "description": "Bright.", "source": "abc"}}';
begin
  live := t.new_listing(agent, 'property');
  perform t.check((select translations = '{}'::jsonb from public.listings where id = live),
    'a new listing has no translations');

  -- The agent saves their own row through the existing update policy.
  perform t.as_user(agent, format('update public.listings set translations = %L where id = %L', saved, live));
  perform t.check((select translations -> 'en' ->> 'title' from public.listings where id = live) = 'Four rooms',
    'the agent saves a translation on their own listing');

  -- Another agent changes nothing.
  perform t.as_user(other, format('update public.listings set translations = %L where id = %L', '{}', live));
  perform t.check((select translations from public.listings where id = live) = saved,
    'another agent cannot change the translations');

  -- Only en, ru and ar; always an object; never huge.
  perform t.check(t.fails(agent, format('update public.listings set translations = %L where id = %L',
    '{"fr": {"title": "x"}}', live), '23514'), 'an unknown language is refused');
  perform t.check(t.fails(agent, format('update public.listings set translations = %L where id = %L',
    '["en"]', live), '23514'), 'an array is refused');
  perform t.check(t.fails(agent, format('update public.listings set translations = %L where id = %L',
    jsonb_build_object('en', jsonb_build_object('title', 'x', 'description', repeat(md5(random()::text), 4000))), live),
    '23514'), 'an oversized translation is refused');
  perform t.check(t.fails(agent, format('update public.listings set translations = null where id = %L', live), '23502'),
    'null is refused');

  -- All three languages fit.
  perform t.as_user(agent, format('update public.listings set translations = %L where id = %L',
    '{"en": {"title": "a", "description": "b", "source": "c"},'
    ' "ru": {"title": "a", "description": "b", "source": "c"},'
    ' "ar": {"title": "a", "description": "b", "source": "c"}}', live));
  perform t.check((select translations ?& array['en', 'ru', 'ar'] from public.listings where id = live),
    'all three languages are saved');
end $$;
