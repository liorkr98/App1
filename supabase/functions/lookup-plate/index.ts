// Supabase Edge Function: lookup-plate
//
// Ownership-gated read of the Ministry of Transport vehicle registers on
// data.gov.il. The plate is a LOOKUP KEY. It is never logged, never stored,
// and never returned (CLAUDE.md §7, §12).
//
// Mapping must stay aligned with src/features/listings/plate.ts — this file
// is self-contained because `supabase functions deploy` uploads this
// directory, not the rest of the repo.
//
// Deployed with verify_jwt enabled. An unauthenticated call never reaches
// this code; we still refuse a body without a declaration.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const CKAN = 'https://data.gov.il/api/3/action/datastore_search';
const REGISTRY_ID = '053cea08-09bc-40ec-8f7a-156f0677aff3';
const MODEL_ID = '142afde2-6228-49f9-8a29-9b6c3a0cbe40';
const HISTORY_ID = 'bb2355dc-9ec7-4f06-9c3f-3344672171da';

const PLATE_DIGITS = /^\d{5,8}$/;
const SEPARATORS = /[\s\-.\u2010-\u2015]/g;

const HAND_LABELS = ['ראשונה', 'שנייה', 'שלישית', 'רביעית', 'חמישית ומעלה'];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function normalisePlate(input: string): string | undefined {
  const digits = input.replace(SEPARATORS, '').trim();
  return PLATE_DIGITS.test(digits) ? digits : undefined;
}

function toMonthYear(value: string): string | undefined {
  const iso = /^(\d{4})-(\d{2})/.exec(value.trim());
  if (iso?.[1] && iso[2]) return `${iso[2]}/${iso[1]}`;
  const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(value.trim());
  if (dmy?.[2] && dmy[3]) return `${dmy[2]}/${dmy[3]}`;
  return undefined;
}

function handLabel(count: number): string | undefined {
  if (count < 1) return undefined;
  return HAND_LABELS[Math.min(count, HAND_LABELS.length) - 1];
}

type FactValue = string | number | boolean | null;

function toLookupValues(sources: {
  registry: Record<string, unknown>;
  model?: Record<string, unknown>;
  ownershipCount?: number;
}): Record<string, FactValue> {
  const { registry, model, ownershipCount } = sources;
  const values: Record<string, FactValue> = {};
  const set = (key: string, value: FactValue | undefined): void => {
    if (value === undefined || value === null || value === '') return;
    values[key] = value;
  };

  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;

  set('make', text(registry.tozeret_nm));
  set('model', text(registry.kinuy_mishari) || text(registry.degem_nm));

  const year = Number(registry.shnat_yitzur);
  if (Number.isInteger(year) && year > 1900) set('year', year);

  set('fuel', text(registry.sug_delek_nm));
  set('previous_ownership', text(registry.baalut));

  if (typeof registry.tokef_dt === 'string') set('test_until', toMonthYear(registry.tokef_dt));

  const cc = Number(model?.nefah_manoa);
  if (Number.isInteger(cc) && cc > 0) set('engine_cc', cc);

  if (ownershipCount !== undefined) set('hand', handLabel(ownershipCount));

  return values;
}

async function ckanSearch(
  resourceId: string,
  filters: Record<string, string | number>,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const response = await fetch(CKAN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ resource_id: resourceId, filters, limit }),
  });
  if (!response.ok) throw new Error('ckan_http');
  const body = (await response.json()) as {
    success?: boolean;
    result?: { records?: Record<string, unknown>[] };
  };
  if (!body.success) throw new Error('ckan_failed');
  return body.result?.records ?? [];
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
  if (!supabaseUrl || !anonKey) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userError,
  } = await caller.auth.getUser();
  if (userError || !user) {
    return json({ error: 'invalid_token' }, 401);
  }

  let body: { plate?: unknown; declaredAt?: unknown };
  try {
    body = (await req.json()) as { plate?: unknown; declaredAt?: unknown };
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (typeof body.declaredAt !== 'string' || !body.declaredAt.trim()) {
    return json({ error: 'declaration_required' }, 403);
  }
  if (Number.isNaN(Date.parse(body.declaredAt))) {
    return json({ error: 'declaration_required' }, 403);
  }

  if (typeof body.plate !== 'string') {
    return json({ error: 'not_found' }, 404);
  }
  const plate = normalisePlate(body.plate);
  if (!plate) {
    return json({ error: 'not_found' }, 404);
  }

  try {
    const asNumber = Number(plate);
    const registryRows = await ckanSearch(
      REGISTRY_ID,
      { mispar_rechev: Number.isInteger(asNumber) ? asNumber : plate },
      1,
    );
    const registry = registryRows[0];
    if (!registry) {
      return json({ error: 'not_found' }, 404);
    }

    let model: Record<string, unknown> | undefined;
    const degem = registry.degem_cd;
    const tozeret = registry.tozeret_cd;
    if (degem !== undefined && tozeret !== undefined) {
      const models = await ckanSearch(
        MODEL_ID,
        {
          degem_cd: typeof degem === 'number' || typeof degem === 'string' ? degem : String(degem),
          tozeret_cd:
            typeof tozeret === 'number' || typeof tozeret === 'string' ? tozeret : String(tozeret),
        },
        1,
      );
      model = models[0];
    }

    const year = Number(registry.shnat_yitzur);
    let ownershipCount: number | undefined;
    // History coverage starts in 2017. A confidently wrong יד on a verified
    // fact is worse than no יד (docs/DATA-SOURCES.md finding 4).
    if (Number.isInteger(year) && year >= 2017) {
      const history = await ckanSearch(
        HISTORY_ID,
        { mispar_rechev: Number.isInteger(asNumber) ? asNumber : plate },
        1000,
      );
      const distinct = new Set(
        history
          .map((row) => row.baalut_dt)
          .filter((value) => value !== undefined && value !== null && value !== ''),
      );
      if (distinct.size > 0) ownershipCount = distinct.size;
    }

    const values = toLookupValues({
      registry,
      ...(model ? { model } : {}),
      ...(ownershipCount !== undefined ? { ownershipCount } : {}),
    });

    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const sourceDate = `${month}/${now.getUTCFullYear()}`;

    return json({ values, sourceDate }, 200);
  } catch {
    // Do not log the plate, the phone, or the address.
    console.error('lookup-plate failed');
    return json({ error: 'failed' }, 502);
  }
});
