-- Immersive capture is deferred (RESEARCH.md v2 §9).
--
-- 0005 stays in place: it is history, and an applied migration is not
-- rewritten. This drops the two functions it created that no longer have a
-- caller, and leaves attach_pdf, which does.
--
-- Why drop rather than leave them sitting there unused: they are the only
-- write path into listings.media.immersive, and an unused write path with a
-- grant on it is a liability, not an asset. Restoring them is `git show
-- immersive-v1:supabase/migrations/0005_attach_immersive.sql`.

drop function if exists public.attach_pano_scene(uuid, jsonb);
drop function if exists public.attach_spin(uuid, jsonb);

-- The jobs.job_type CHECK constraint in 0003 still permits stitch_panorama,
-- extract_frames and build_sprite. Left deliberately wide: nothing can
-- enqueue them now that the handlers are gone, and keeping the constraint
-- permissive means restoring the feature is a code change rather than a
-- migration against a live table.
