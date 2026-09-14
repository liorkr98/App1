import type { LookupValues } from '@/features/listings/plate';
import { supabase, supabaseConfigured, supabaseUrl, supabaseKey } from './supabase';

/**
 * Asks the lookup-plate edge function for register values.
 *
 * The plate travels in the POST body and nowhere else. The function does not
 * log it, and nothing here stores it. A missing declaration is refused
 * client-side so we do not even send the request.
 */
export async function lookupPlate(input: {
  plate: string;
  declaredAt: string;
}): Promise<{ values: LookupValues; sourceDate: string } | { error: string }> {
  if (!supabaseConfigured) return { error: 'unconfigured' };

  const { data: session } = await supabase().auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { error: 'signed_out' };

  const response = await fetch(`${supabaseUrl}/functions/v1/lookup-plate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      plate: input.plate,
      declaredAt: input.declaredAt,
    }),
  });

  if (!response.ok) {
    return { error: response.status === 404 ? 'not_found' : 'failed' };
  }

  const body = (await response.json()) as {
    values?: LookupValues;
    sourceDate?: string;
  };

  if (!body.values) return { error: 'empty' };
  return { values: body.values, sourceDate: body.sourceDate ?? '' };
}
