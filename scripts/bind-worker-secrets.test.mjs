import assert from 'node:assert/strict';
import test from 'node:test';

import { runtimeSecrets } from './bind-worker-secrets.mjs';

test('copies only the two runtime secrets', () => {
  const found = runtimeSecrets({
    DEEPSEEK_API_KEY: 'deepseek-secret',
    SUPABASE_SERVICE_ROLE_KEY: 'service-secret',
    PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SITE_URL: 'https://besivov.liorkr98.workers.dev',
  });
  assert.deepEqual(found, {
    DEEPSEEK_API_KEY: 'deepseek-secret',
    SUPABASE_SERVICE_ROLE_KEY: 'service-secret',
  });
});

test('skips a secret that is missing or empty', () => {
  assert.deepEqual(runtimeSecrets({ DEEPSEEK_API_KEY: '' }), {});
  assert.deepEqual(runtimeSecrets({}), {});
  assert.deepEqual(runtimeSecrets({ SUPABASE_SERVICE_ROLE_KEY: 'only-service' }), {
    SUPABASE_SERVICE_ROLE_KEY: 'only-service',
  });
});
