-- The photo check's angle and suggestions, and the WhatsApp line (0046).
-- Runs after tests.sql, so the t.* helpers exist.

do $$
declare
  owner uuid := t.new_user('angles@test');
  other uuid := t.new_user('angles-other@test');
  car uuid := t.new_listing(owner, 'vehicle');
  path text;
begin
  path := car::text || '/browser/front.webp';
  perform t.as_user(owner, format(
    'select public.attach_own_photo_review(%L, %L, null, 0.9, %L, null, 4, %L, %L)',
    car, path, '{}', 'frontLeft', '{silver}'));
  perform t.check(
    (select angle = 'frontLeft' and seen = '{silver}' from public.photo_reviews where listing_id = car),
    'the owner records an angle and what the photograph shows');

  perform t.check(t.fails(owner, format(
    'select public.attach_own_photo_review(%L, %L, null, null, %L, null, null, %L)', car, path, '{}', 'upsideDown'), 'P0001', 'bad_angle'),
    'an angle off the list is refused');
  perform t.check(t.fails(owner, format(
    'select public.attach_own_photo_review(%L, %L, null, null, %L, null, null, null, %L)', car, path, '{}', '{pool}'), 'P0001', 'bad_seen'),
    'a suggestion off the list is refused');
  perform t.check(t.fails(other, format(
    'select public.attach_own_photo_review(%L, %L, null, null, %L, null, null, %L)', car, path, '{}', 'rear'), 'P0001', 'not_owner'),
    'only the owner writes it');

  -- The old call, without the two new arguments, still works.
  perform t.as_user(owner, format(
    'select public.attach_own_photo_review(%L, %L, null, null, %L, %L, 3)', car, car::text || '/browser/b.webp', '{dark}', 'turnOnLight'));
  perform t.check((select seen = '{}' from public.photo_reviews where photo_path like '%/b.webp'), 'the seven-argument call still records');

  perform t.as_user(owner, format('update public.listings set share_line = %L where id = %L', 'שמור, יד ראשונה, מוכן לנסיעה', car));
  perform t.check((select share_line from public.listings where id = car) = 'שמור, יד ראשונה, מוכן לנסיעה', 'the owner writes the WhatsApp line');
  perform t.check(t.fails(owner, format('update public.listings set share_line = %L where id = %L', 'שורה' || chr(10) || 'שנייה', car), '23514'),
    'the WhatsApp line is one line');
  perform t.check(t.fails(owner, format('update public.listings set share_line = %L where id = %L', repeat('א', 161), car), '23514'),
    'and a short one');
end $$;
