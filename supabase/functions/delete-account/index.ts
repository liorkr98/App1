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

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LISTING_BUCKETS = ['originals', 'derived'] as const;
const BRANDING_BUCKET = 'branding';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/**
 * Every object under `folder/` in one bucket. Recurses into subfolders
 * because derived output is nested (`{listingId}/{photoId}.webp`, OG, PDF).
 *
 * Paths only — never log them. Original filenames can carry addresses.
 *
 * A list error is treated as an empty folder. The common case is a listing
 * (or a user) that never uploaded anything — storage.list on a missing
 * prefix must not block account deletion. A remove error still fails closed.
 */
async function listPaths(
  admin: SupabaseClient,
  bucket: string,
  folder: string,
): Promise<string[]> {
  const { data, error } = await admin.storage.from(bucket).list(folder, {
    limit: 1000,
    offset: 0,
  });
  if (error || !data) return [];

  const paths: string[] = [];
  for (const item of data) {
    const path = folder ? `${folder}/${item.name}` : item.name;
    if (item.id) {
      paths.push(path);
    } else {
      paths.push(...(await listPaths(admin, bucket, path)));
    }
  }
  return paths;
}

async function emptyPrefix(
  admin: SupabaseClient,
  bucket: string,
  folder: string,
): Promise<boolean> {
  const paths = await listPaths(admin, bucket, folder);

  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);
    const { error } = await admin.storage.from(bucket).remove(chunk);
    if (error) {
      console.error('delete-account storage purge failed', { bucket, count: chunk.length });
      return false;
    }
  }
  return true;
}

async function emptyListingPrefix(admin: SupabaseClient, listingId: string): Promise<boolean> {
  for (const bucket of LISTING_BUCKETS) {
    const emptied = await emptyPrefix(admin, bucket, listingId);
    if (!emptied) return false;
  }
  return true;
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

  // Storage objects are NOT cascaded when the listing row goes. Purge both
  // buckets first, keyed by listing id, then delete the user. Listings and
  // profiles cascade from auth.users (0001, 0002).
  const { data: listings, error: listingsError } = await adminClient
    .from('listings')
    .select('id')
    .eq('owner_id', user.id);

  if (listingsError) {
    console.error('delete-account listings lookup failed', { message: listingsError.message });
    return json({ error: 'delete_failed' }, 500);
  }

  for (const listing of listings ?? []) {
    const listingId = typeof listing.id === 'string' ? listing.id : '';
    if (!listingId) continue;
    const emptied = await emptyListingPrefix(adminClient, listingId);
    if (!emptied) return json({ error: 'delete_failed' }, 500);
  }

  // The logo lives under the user id, not a listing id. Same fail-closed
  // rule: if the folder cannot be listed or emptied, the auth user stays.
  const brandingEmptied = await emptyPrefix(adminClient, BRANDING_BUCKET, user.id);
  if (!brandingEmptied) return json({ error: 'delete_failed' }, 500);

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteError) {
    // Do not echo the raw error: it can carry identifiers into client logs.
    console.error('delete-account failed', { userId: user.id, message: deleteError.message });
    return json({ error: 'delete_failed' }, 500);
  }

  return json({ success: true }, 200);
});
