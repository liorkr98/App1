// Supabase Edge Function: delete-account
//
// Apple rejects any app that offers account creation but no in-app account
// deletion (CLAUDE.md §7). This is the server half — the client cannot delete
// an auth user, because that requires the service-role key, which must never
// be in the bundle (CLAUDE.md §8).
//
// Contract: POST with the caller's own access token. There is no user id
// parameter, and that is deliberate — taking one would let any signed-in user
// delete someone else's account. The identity comes from the verified JWT and
// nowhere else.
//
// Deployed with verify_jwt enabled, so an unauthenticated call never reaches
// this code.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'missing_authorization' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  // Resolve the caller from their own token, using the anon key. This client
  // is bound to the caller's identity and RLS.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser();

  if (userError || !user) {
    return json({ error: 'invalid_token' }, 401);
  }

  // Separate admin client. Created only after the caller is verified, and used
  // only with the id that came from the verified token.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Deleting the auth user cascades to public.profiles via
  // `references auth.users (id) on delete cascade` in migration 0001.
  //
  // When a cloned app adds tables that are NOT keyed to auth.users with a
  // cascade, delete those rows HERE, before this call. A table left behind is
  // both a privacy failure and an App Review failure.
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteError) {
    // Do not echo the raw error: it can carry identifiers into client logs.
    console.error('delete-account failed', { userId: user.id, message: deleteError.message });
    return json({ error: 'delete_failed' }, 500);
  }

  return json({ success: true }, 200);
});
