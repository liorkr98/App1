-- Closed-beta publish allowlist.
--
-- ============================ HUMAN REVIEW ============================
-- CLAUDE.md §8: this table is an entitlement grant. A row in it is what
-- lets an agent publish. Nothing in the client may INSERT, UPDATE or
-- DELETE here — there are no write policies, so the only way a row appears
-- is a human running SQL (or the service role, which is the same thing).
--
-- FAIL CLOSED. The editor reads this with the user's own JWT. A missing
-- row is 'unpaid'. A read error is 'unknown'. Only a present row is
-- 'paid'. There is no branch that grants on timeout.
--
-- This is the ENTITLEMENT SOURCE until a PSP adapter exists
-- (docs/adr/0003-payments-provider-interface.md). Replacing it with a
-- payment check is a product change that also needs human review, not a
-- mechanical swap.
-- ======================================================================

create table if not exists public.beta_publishers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Who granted this, as a trail — an email, a name, not a secret. The
  -- editor never reads this column; it exists so a later audit can see
  -- that a person did this on purpose.
  granted_by text not null,
  granted_at timestamptz not null default now(),
  note text
);

comment on table public.beta_publishers is
  'Human-reviewed publish entitlement. No client writes. See CLAUDE.md §8.';

alter table public.beta_publishers enable row level security;

-- A signed-in agent may see WHETHER they are on the list. They may not see
-- anyone else, and they may not write.
create policy "beta_publishers_select_own"
  on public.beta_publishers
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- THERE IS DELIBERATELY NO INSERT, UPDATE OR DELETE POLICY.
