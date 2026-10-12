import { supabase } from './supabase';

/**
 * The account kind (agent / office / dealer / private, migration 0040) and
 * whether the broker licence checked out. Kept apart from the profile form
 * (lib/profile.ts): choosing a kind decides which plans are offered and
 * grants nothing, and the verified flag is set only by /api/licence-check
 * through the service role — this file can read it, never write it.
 */
export type AccountKind = 'agent' | 'office' | 'dealer' | 'private';

export const ACCOUNT_KINDS: readonly AccountKind[] = ['agent', 'office', 'dealer', 'private'];

export function isAccountKind(value: unknown): value is AccountKind {
  return typeof value === 'string' && (ACCOUNT_KINDS as readonly string[]).includes(value);
}

export async function loadAccount(): Promise<{ kind: AccountKind | null; licenceVerified: boolean } | null> {
  try {
    const { data, error } = await supabase().from('profiles').select('account_kind, licence_verified_at').maybeSingle();
    if (error) return null;
    const row = (data ?? {}) as { account_kind?: unknown; licence_verified_at?: unknown };
    return {
      kind: isAccountKind(row.account_kind) ? row.account_kind : null,
      licenceVerified: typeof row.licence_verified_at === 'string',
    };
  } catch {
    return null;
  }
}

export async function saveAccountKind(kind: AccountKind): Promise<boolean> {
  try {
    const client = supabase();
    const { data: session } = await client.auth.getSession();
    const id = session.session?.user.id;
    if (!id) return false;
    const { error } = await client.from('profiles').update({ account_kind: kind }).eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

export type LicenceVerdict = 'verified' | 'not_found' | 'unavailable';

/** Asks /api/licence-check. Anything but a clean answer is 'unavailable'. */
export async function checkLicence(licence: string): Promise<LicenceVerdict> {
  try {
    const { data: session } = await supabase().auth.getSession();
    const token = session.session?.access_token;
    if (!token) return 'unavailable';
    const response = await fetch('/api/licence-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ licence }),
    });
    const body = (await response.json()) as { verdict?: unknown };
    return body.verdict === 'verified' || body.verdict === 'not_found' ? body.verdict : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
