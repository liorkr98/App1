/**
 * The broker licence check (docs/PRICING.md: agent plans are for licensed
 * brokers; CLAUDE.md §8: a failed check is "not verified", fail closed).
 *
 * The Justice Ministry broker register on data.gov.il is queried by its
 * resource id with CKAN `datastore_search`. Its column names are not ours to
 * rely on, so a match is EXACT equality of the licence number against any
 * field of a returned record — full-text search finds candidates, this
 * decides.
 */

/** Digits only, as people type them ("12-345" and " 12345 " are the same). Null when it cannot be one. */
export function normalizeLicence(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const digits = String(raw).replace(/[\s\-‐-―־/.]/g, '');
  return /^\d{3,10}$/.test(digits) ? digits.replace(/^0+(?=\d)/, '') : null;
}

export type LicenceVerdict = 'verified' | 'not_found' | 'unavailable';

/** The register's answer, read strictly: anything unexpected is unavailable, never verified. */
export function licenceVerdict(response: unknown, licence: string): LicenceVerdict {
  if (!response || typeof response !== 'object') return 'unavailable';
  const body = response as { success?: unknown; result?: { records?: unknown } };
  if (body.success !== true || !body.result || !Array.isArray(body.result.records)) return 'unavailable';
  const wanted = normalizeLicence(licence);
  if (!wanted) return 'not_found';
  for (const record of body.result.records) {
    if (!record || typeof record !== 'object') continue;
    for (const value of Object.values(record as Record<string, unknown>)) {
      if (normalizeLicence(value) === wanted) return 'verified';
    }
  }
  return 'not_found';
}
