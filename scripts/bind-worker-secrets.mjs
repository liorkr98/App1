#!/usr/bin/env node
/**
 * Copy the two Worker secrets out of the build environment.
 *
 * Workers Builds → Settings → Build → Variables and secrets are present
 * while `npm run build` and `wrangler deploy` run, and nowhere else.
 * Cloudflare's own note: build variables are not available at runtime.
 * The photo check and the phone upload read `env` from `cloudflare:workers`
 * on the request, so a key that exists only in that build list answers
 * `no_key` / `not_configured` on the live site.
 *
 * `wrangler deploy` runs wrangler.jsonc `build.command` before it uploads.
 * This script uses that moment: if the build environment holds
 * DEEPSEEK_API_KEY or SUPABASE_SERVICE_ROLE_KEY, it attaches them to the
 * Worker as real secrets. The upload that follows keeps secrets.
 *
 * Values are written to a mode-600 file and never printed. Outside Workers
 * Builds the script does nothing, so a laptop `wrangler deploy` cannot
 * publish whatever happens to be in the shell.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RUNTIME_SECRET_NAMES = ['DEEPSEEK_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {Record<string, string>}
 */
export function runtimeSecrets(env) {
  /** @type {Record<string, string>} */
  const found = {};
  for (const name of RUNTIME_SECRET_NAMES) {
    const value = env[name];
    if (typeof value === 'string' && value.length > 0) found[name] = value;
  }
  return found;
}

function main() {
  if (process.env.BESIVOV_SECRET_BIND === '1') return;
  if (process.env.WORKERS_CI !== '1') return;

  const found = runtimeSecrets(process.env);
  const names = Object.keys(found);
  if (names.length === 0) {
    console.log('runtime secrets: none in the build environment');
    return;
  }

  const file = path.join(os.tmpdir(), `besivov-secrets-${process.pid}.json`);
  fs.writeFileSync(file, JSON.stringify(found), { mode: 0o600 });
  try {
    const result = spawnSync('npx', ['--yes', 'wrangler', 'secret', 'bulk', file], {
      stdio: 'inherit',
      env: { ...process.env, BESIVOV_SECRET_BIND: '1' },
    });
    if (result.status !== 0) process.exit(result.status === null ? 1 : result.status);
  } finally {
    fs.rmSync(file, { force: true });
  }
  console.log(`runtime secrets bound: ${names.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
