import { supabase } from '@/core/supabase/client';

/**
 * Deletes the signed-in user's account and all server-side data.
 *
 * Apple rejects apps that let you create an account but not delete one
 * (CLAUDE.md §7), and "delete" has to mean the rows are actually gone — not
 * flagged, not anonymised.
 *
 * The real work happens in the `delete-account` edge function, because
 * removing an auth user needs the service-role key and that key must never be
 * in the client bundle (CLAUDE.md §8). The function takes no user id: it
 * derives identity from the caller's verified JWT, so this cannot be pointed
 * at somebody else's account.
 *
 * @throws when the server refuses or the request fails, so the caller can
 *         keep the user on the settings screen with an error rather than
 *         signing them out of an account that still exists.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });

  if (error) {
    throw error;
  }

  // The account is gone, so the local session is now a token for a user that
  // no longer exists. Clearing it locally avoids a confusing 401 on the next
  // request. Failure here is not fatal — the account is already deleted.
  await supabase.auth.signOut().catch(() => undefined);
}
