import type { AgentProfile } from '@/features/agents/profile';

import { supabase } from './supabase';

/**
 * Reading and writing the signed-in agent's own profile row.
 *
 * The rules live in @/features/agents/profile — what a profile needs before it
 * can brand a listing, and how it becomes a `Seller`. This file is only the
 * trip to the database, and holds no product logic, so the question "why can I
 * not save" is answerable without a network.
 *
 * THE ROW IS NOT CREATED HERE. 0001 creates one by trigger on signup and 0009
 * backfilled anyone who predated the trigger, so by the time an agent reaches
 * this page the row exists and this is an update. `upsert` rather than
 * `update` anyway — a trigger that failed once should cost the agent a
 * confusing empty form, not a save that silently affects zero rows and reports
 * success.
 *
 * RLS decides whose row this is, not the code below. The policies in 0001 are
 * `(select auth.uid()) = id` per operation, so there is no `.eq('id', …)`
 * filter here that could be forgotten: the database will not return or accept
 * anyone else's row whatever this file asks for. A filter in the client is a
 * suggestion.
 */

/** The database's column names, which are snake_case and not the domain's. */
interface ProfileRow {
  display_name: string | null;
  phone: string | null;
  agency_name: string | null;
  role: string | null;
  licence_number: string | null;
}

function toDomain(row: ProfileRow): AgentProfile {
  return {
    displayName: row.display_name,
    phone: row.phone,
    agencyName: row.agency_name,
    role: row.role,
    licenceNumber: row.licence_number,
  };
}

/**
 * The signed-in agent's profile, or undefined when nobody is signed in.
 *
 * Distinguishes "not signed in" from "signed in with an empty profile", which
 * the page needs: the first is a link to /enter and the second is a form.
 */
export async function loadProfile(): Promise<
  { profile: AgentProfile } | { signedOut: true } | { error: string }
> {
  const client = supabase();

  const { data: session } = await client.auth.getSession();
  if (!session.session?.user) return { signedOut: true };

  const { data, error } = await client
    .from('profiles')
    .select('display_name, phone, agency_name, role, licence_number')
    .maybeSingle();

  if (error) return { error: error.message };

  // maybeSingle rather than single: no row is a state to render, not an
  // exception. It means the signup trigger did not fire, and the agent should
  // get an empty form they can fill in rather than an error they cannot act
  // on — the save below will create the row.
  return { profile: data ? toDomain(data as ProfileRow) : {} };
}

/**
 * Saves the profile.
 *
 * Empty strings become null. A column holding '' and a column holding nothing
 * are the same absence to a reader and different values to a query, and the
 * distinction the product actually cares about — "the seller said there is
 * none" versus "nobody answered" — belongs to facts, not to a profile field.
 * Storing '' here would put a third state into a two-state column.
 *
 * The PHONE IS STORED AS TYPED, not normalised. What an agent recognises as
 * their own number is 050-123-4567, and a settings form that silently rewrites
 * it to 972501234567 looks like it lost the number. Normalisation happens at
 * the point of use — `toSeller`, on the way onto a listing — where the format
 * is a technical requirement of wa.me rather than something a person reads.
 */
export async function saveProfile(
  profile: AgentProfile,
): Promise<{ ok: true } | { signedOut: true } | { error: string }> {
  const client = supabase();

  const { data: session } = await client.auth.getSession();
  const id = session.session?.user.id;
  if (!id) return { signedOut: true };

  const trimmed = (value: string | null | undefined): string | null => {
    const text = value?.trim();
    return text ? text : null;
  };

  const { error } = await client.from('profiles').upsert(
    {
      id,
      display_name: trimmed(profile.displayName),
      phone: trimmed(profile.phone),
      agency_name: trimmed(profile.agencyName),
      role: trimmed(profile.role),
      licence_number: trimmed(profile.licenceNumber),
    },
    { onConflict: 'id' },
  );

  return error ? { error: error.message } : { ok: true };
}
