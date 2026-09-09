/**
 * Ingestion configuration.
 *
 * Getters, not eager reads: a job that only syncs schools must not fail to
 * start because OSRM_URL is unset. The same lesson as the worker's
 * PAGE_BASE_URL — validate what you use, where you use it.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Set it with: fly secrets set ${name}=... (never commit it)`);
  }
  return value;
}

export const env = {
  get supabaseUrl(): string {
    return required('SUPABASE_URL');
  },
  /** Bypasses RLS. Fly secrets only — never a client, never the repo. */
  get serviceRoleKey(): string {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  /** Our own OSRM, e.g. http://osrm.internal:5000. Never a public instance. */
  get osrmUrl(): string {
    return required('OSRM_URL').replace(/\/+$/, '');
  },

  /**
   * Our own Nominatim, on the same Israel extract OSRM uses.
   *
   * NEVER nominatim.openstreetmap.org. Its usage policy forbids systematic
   * queries, and pointing a publish pipeline at a volunteer-funded service
   * would be both a breach of that policy and a single point of failure we do
   * not control.
   */
  get nominatimUrl(): string {
    return required('NOMINATIM_URL').replace(/\/+$/, '');
  },
} as const;
